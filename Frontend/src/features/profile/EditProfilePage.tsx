import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AVAILABILITY_STATUSES, REGIONS, TRADES, type Region, type Trade } from '../../api/types';
import { AppNav } from '../../components/AppNav';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import {
  addWorkEntry,
  classifyProfileError,
  removeWorkEntry,
  updateWorkEntry,
} from '../../api/profile.api';
import { AvatarField } from './components/AvatarField';
import { Choice } from './components/Choice';
import { CompletedWorkPanel } from './components/CompletedWorkPanel';
import { EditNumber, EditSelect, EditText, EditTextarea } from './components/EditField';
import { EquipmentPicker } from './components/EquipmentPicker';
import { RatingsPanel } from './components/RatingsPanel';
import { TrustPanel } from './components/TrustPanel';
import { WorkEntryForm } from './components/WorkEntryForm';
import { LocationField } from '../../location/LocationField';
import { initialsOf, type CompletedWorkEntry } from './profileModel';
import type { WorkEntryValues } from './components/WorkEntryForm';
import { fromProfile, useEditProfileForm } from './useEditProfileForm';
import { useMyProfile } from './useMyProfile';
import { useProfileSave } from './useProfileSave';
import profileCss from './profile.css?inline';
import editProfileCss from './edit-profile.css?inline';
import placeCss from '../../location/place.css?inline';

/** Bounds the backend already enforces on the same values where it accepts them at Register. */
const MAX = { name: 100, companyName: 120, city: 80, phone: 30, specialtyOther: 60, bio: 600 } as const;

const EMPTY_FORM = fromProfile({
  firstName: '', lastName: '', email: '', language: 'he', profileComplete: false,
  bio: '', specialties: [], specialtyOther: '', heavyEquipment: [], businessPhone: '', city: '',
  region: null, place: null, travelRadiusKm: null, delayToleranceDays: null, noticeRequiredDays: null,
  avatarUrl: null, companyName: null, officePhone: null, availability: null,
  standing: null, companyPosition: null, companyMembershipActive: false,
  rating: null, flexibility: null, ratings: [], work: [],
});

/**
 * Edit profile — the editing surface behind My profile's single Edit control.
 *
 * Every value is read from `GET /users/me` and written back through the two routes that own it:
 * the person's own fields to `PATCH /users/me`, and company name, office phone and availability to
 * `PATCH /companies/me`, because those three live on the company document.
 *
 * Rating, flexibility and the ratings list are read-only here, as they are everywhere: the first
 * two are computed from behaviour and the third is other people's words.
 */
export const EditProfilePage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { profile, loading, failure: loadFailure, setProfile, reload } = useMyProfile();
  const form = useEditProfileForm(EMPTY_FORM);
  const {
    values, setValue, touched, markTouched, markAllTouched, toggleSpecialty, toggleEquipment,
    setWork, reset, flags, missing, isValid,
  } = form;
  const { save, saving, saved, failure: saveFailure, clearSaved } = useProfileSave();

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'edit-profile.css', css: editProfileCss },
    { id: 'place.css', css: placeCss },
  );
  useDocumentTitle('עריכת הפרופיל / Edit profile — FieldSync');

  const [equipmentOpen, setEquipmentOpen] = useState(false);
  /** `null` = closed, `'new'` = the add form, an entry = that entry being edited. */
  const [workForm, setWorkForm] = useState<'new' | CompletedWorkEntry | null>(null);
  const [workBusy, setWorkBusy] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  // The form is filled once the server has answered, and again after a save returns a fresher read.
  useEffect(() => {
    if (profile) reset(fromProfile(profile));
  }, [profile, reset]);

  const fullName = `${values.firstName} ${values.lastName}`.trim();
  const initials = initialsOf(values.firstName, values.lastName);
  const regionOptions = REGIONS.map((code) => ({ value: code, label: t.regions[code] }));

  /* A required field left empty blocks the request, so a stale value can never read as saved. */
  const submit = useCallback(async (): Promise<void> => {
    if (!profile) return;
    if (!isValid) {
      markAllTouched();
      setBlocked(true);
      return;
    }

    setBlocked(false);
    const next = await save(values, profile);
    if (next) setProfile(next);
  }, [profile, isValid, markAllTouched, save, setProfile, values]);

  const saveWork = useCallback(async (
    target: 'new' | CompletedWorkEntry,
    fields: WorkEntryValues,
    image: File | null,
  ): Promise<void> => {
    setWorkBusy(true);
    setWorkError(null);
    try {
      if (target === 'new') {
        const created = await addWorkEntry(
          { title: fields.title, meta: fields.meta, ...(fields.scope ? { scope: fields.scope } : {}) },
          image,
        );
        setWork([...values.work, created]);
      } else {
        const updated = await updateWorkEntry(target.id, fields, image);
        setWork(values.work.map((entry) => (entry.id === updated.id ? updated : entry)));
      }
      setWorkForm(null);
    } catch (error) {
      const code = classifyProfileError(error);
      setWorkError(
        code === 'UNSUPPORTED_FILE_TYPE' ? t.editProfile.avatar.badType
        : code === 'FILE_TOO_LARGE' ? t.editProfile.avatar.tooLarge
        : code === 'NETWORK' ? t.profile.errors.network
        : target === 'new' ? t.editProfile.work.addFailed
        : t.editProfile.work.editFailed,
      );
    } finally {
      setWorkBusy(false);
    }
  }, [setWork, t, values.work]);

  const dropWork = useCallback(async (id: string): Promise<void> => {
    setWorkError(null);
    try {
      await removeWorkEntry(id);
      setWork(values.work.filter((entry) => entry.id !== id));
    } catch {
      setWorkError(t.editProfile.work.removeFailed);
    }
  }, [setWork, t, values.work]);

  if (loading || profile === null) {
    return (
      <div className="app">
        <AppNav name={fullName} initials={initials} />
        <main className="profile">
          {loadFailure ? (
            <div className="notice notice--warn" role="alert">
              <span>{loadFailure === 'NETWORK' ? t.profile.errors.network : t.profile.errors.generic}</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={reload}>
                {t.profile.errors.retry}
              </button>
            </div>
          ) : (
            <p className="panel__lede">{t.profile.loading}</p>
          )}
        </main>
      </div>
    );
  }

  const saveMessage =
    blocked ? t.editProfile.actions.blocked
    : saveFailure === 'NOT_PERMITTED' ? t.editProfile.actions.notPermitted
    : saveFailure === 'NETWORK' ? t.profile.errors.network
    : saveFailure === 'VALIDATION' ? t.editProfile.actions.invalid
    : saveFailure ? t.editProfile.actions.saveFailed
    : saved ? t.editProfile.actions.saved
    : t.editProfile.actions.aside;

  return (
    <div className="app">
      <AppNav name={fullName} initials={initials} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{t.editProfile.title}</h1>
            <p className="profile__sub">{t.editProfile.lede}</p>
          </div>
        </header>

        {/* The same trust panel as the view screen, and read-only here too. Availability is not
            shown as a status in it, because this screen offers it as a choice further down. */}
        <TrustPanel
          profile={{
            ...profile,
            firstName: values.firstName,
            lastName: values.lastName,
            companyName: values.companyName || null,
            specialties: values.specialties,
            city: values.city,
            region: values.region === '' ? null : values.region,
          }}
          initials={initials}
          availabilityLabel={null}
        />

        {/* noValidate: the instructor rule is no native validation popups. */}
        <form
          className="profile-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="profile-grid">
            {/* ── Column A: identity ── */}
            <div className="profile-grid__col">
              <section className="panel" aria-labelledby="identity-title">
                <h2 id="identity-title" className="panel__title">{t.editProfile.identity.title}</h2>
                <p className="panel__lede">{t.editProfile.identity.lede}</p>

                <AvatarField profile={profile} initials={initials} onChanged={setProfile} />

                {/* D14: this is the *organization's* work availability — whether the business is
                    taking new work — and it is the owner's to set. It is never any employee's
                    personal availability, and the three labels are noun forms so they stay
                    gender-neutral, which the enum requires. */}
                <fieldset className="form-group choice-set">
                  <legend className="field-label">{t.editProfile.availabilityLegend}</legend>
                  <ul className="choice-grid choice-grid--avail">
                    {AVAILABILITY_STATUSES.map((status) => (
                      <li key={status}>
                        <Choice
                          type="radio" name="availability" value={status}
                          checked={values.availability === status}
                          onChange={() => setValue('availability', status)}
                        >
                          <span className={`choice__label avail avail--${status}`}>
                            <span className="avail__dot" aria-hidden="true" />
                            {t.availability[status]}
                          </span>
                        </Choice>
                      </li>
                    ))}
                  </ul>
                </fieldset>

                <div className="form-row">
                  <EditText
                    id="firstName" label={t.editProfile.firstName} dir="auto" required
                    maxLength={MAX.name} value={values.firstName}
                    onChange={(v) => setValue('firstName', v)} onBlur={() => markTouched('firstName')}
                    touched={!!touched.firstName}
                  />
                  <EditText
                    id="lastName" label={t.editProfile.lastName} dir="auto" required
                    maxLength={MAX.name} value={values.lastName}
                    onChange={(v) => setValue('lastName', v)} onBlur={() => markTouched('lastName')}
                    touched={!!touched.lastName}
                  />
                </div>

                {/* Company name is the professional identity, and it is the same required, public,
                    searchable value Register collects and My profile displays (D28). */}
                <EditText
                  id="companyName" label={t.editProfile.companyName.label}
                  placeholder={t.editProfile.companyName.placeholder} dir="auto" required
                  autoComplete="organization" maxLength={MAX.companyName} value={values.companyName}
                  onChange={(v) => setValue('companyName', v)} onBlur={() => markTouched('companyName')}
                  touched={!!touched.companyName}
                />

                {/* Two numbers on two different documents, each optional on its own terms, and
                    neither a fallback for the other. The personal / login number is not asked for
                    here and is never professional profile-display data. */}
                <div className="form-row">
                  <EditText
                    id="officePhone" label={t.editProfile.officePhone.label}
                    optionalText={t.editProfile.optional}
                    placeholder={t.editProfile.officePhone.placeholder} type="tel" dir="ltr"
                    autoComplete="work tel" maxLength={MAX.phone} value={values.officePhone}
                    onChange={(v) => setValue('officePhone', v)}
                  />
                  <EditText
                    id="businessPhone" label={t.editProfile.businessPhone.label}
                    optionalText={t.editProfile.optional}
                    placeholder={t.editProfile.businessPhone.placeholder} type="tel" dir="ltr"
                    autoComplete="tel" maxLength={MAX.phone} value={values.businessPhone}
                    onChange={(v) => setValue('businessPhone', v)}
                  />
                </div>
                <p className="field-hint">{t.editProfile.phonesHint}</p>

                <EditTextarea
                  id="bio" label={t.editProfile.bio.label} placeholder={t.editProfile.bio.placeholder}
                  hint={t.editProfile.bio.hint} maxLength={MAX.bio} value={values.bio}
                  onChange={(v) => setValue('bio', v)}
                />

                {/* Specialties are an array on the account, so more than one may be chosen. */}
                <fieldset className="form-group choice-set">
                  <legend className="field-label">{t.editProfile.specialties.legend}</legend>
                  <p className="field-hint">{t.editProfile.specialties.hint}</p>

                  <ul className="choice-grid">
                    {TRADES.map((code: Trade) => (
                      <li key={code}>
                        <Choice
                          type="checkbox" name="specialties" value={code}
                          checked={values.specialties.includes(code)}
                          onChange={(on) => toggleSpecialty(code, on)}
                        >
                          <span className="choice__label">{t.trades[code]}</span>
                        </Choice>
                      </li>
                    ))}
                  </ul>

                  {flags.showOther ? (
                    <div className="other-inline other-inline--visible">
                      <label className="field-label" htmlFor="specialtyOther">
                        {t.editProfile.specialties.otherLabel}
                      </label>
                      <input
                        className="form-input" type="text" id="specialtyOther" name="specialtyOther"
                        dir="auto" maxLength={MAX.specialtyOther}
                        placeholder={t.editProfile.specialties.otherPlaceholder}
                        value={values.specialtyOther}
                        onChange={(e) => setValue('specialtyOther', e.target.value)}
                      />
                    </div>
                  ) : null}

                  {flags.showEquipment ? (
                    <>
                      <button
                        type="button"
                        className="equip-trigger equip-trigger--visible"
                        onClick={() => setEquipmentOpen(true)}
                      >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        {t.editProfile.equipment.trigger}
                      </button>
                      <p className="field-label field-label--sub">{t.editProfile.equipment.selected}</p>
                      {values.equipment.length === 0 ? (
                        <p className="field-hint">{t.editProfile.equipment.none}</p>
                      ) : (
                        <ul className="tags">
                          {values.equipment.map((code) => (
                            <li key={code} className="tag">{t.editProfile.equipment.items[code]}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : null}
                </fieldset>
              </section>
            </div>

            {/* ── Column B: location and scheduling ── */}
            <div className="profile-grid__col">
              <section className="panel" aria-labelledby="location-title">
                <h2 id="location-title" className="panel__title">{t.editProfile.location.title}</h2>
                <p className="panel__lede">{t.editProfile.location.lede}</p>

                <LocationField
                  label={t.editProfile.location.city}
                  placeholder={t.editProfile.location.cityPlaceholder}
                  place={values.place}
                  city={values.city}
                  onPlace={(place) => { setValue('place', place); markTouched('place'); }}
                  onCity={(city) => { setValue('city', city); markTouched('city'); }}
                  required
                  invalid={!!touched.city && missing.location}
                  error={t.editProfile.location.cityRequired}
                />

                <EditSelect<Region | ''>
                  id="region" label={t.editProfile.location.region}
                  placeholder={t.editProfile.location.regionPlaceholder}
                  options={regionOptions} required
                  touched={!!touched.region}
                  {...(missing.region ? { error: t.editProfile.location.regionRequired } : {})}
                  value={values.region}
                  onChange={(v) => { setValue('region', v); markTouched('region'); }}
                />

                <EditNumber
                  id="travelRadiusKm" label={t.editProfile.location.travel}
                  className={`form-group--travel${flags.nationwide ? ' is-nationwide' : ''}`}
                  unit={t.editProfile.location.km} min={0} max={500} step={1}
                  value={values.travelRadiusKm} onChange={(v) => setValue('travelRadiusKm', v)}
                  hints={
                    <>
                      <p className="field-hint field-hint--default">{t.editProfile.location.travelHint}</p>
                      <p className="field-hint field-hint--na">{t.editProfile.location.travelNa}</p>
                    </>
                  }
                />
              </section>

              <section className="panel" aria-labelledby="sched-title">
                <h2 id="sched-title" className="panel__title">{t.editProfile.scheduling.title}</h2>
                <p className="panel__lede">{t.editProfile.scheduling.lede}</p>
                {/* The one piece of copy that belongs here rather than on the view screen: it is
                    about the consequence of setting these values, which is only in question while
                    they are being set. */}
                <p className="notice">
                  <svg className="notice__icon" width="17" height="17" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>{t.editProfile.scheduling.notice}</span>
                </p>

                <EditNumber
                  id="delayToleranceDays" label={t.editProfile.scheduling.delay}
                  unit={t.editProfile.scheduling.days} min={0} max={30}
                  value={values.delayToleranceDays} onChange={(v) => setValue('delayToleranceDays', v)}
                  hints={<p className="field-hint">{t.editProfile.scheduling.delayHint}</p>}
                />

                <EditNumber
                  id="noticeRequiredDays" label={t.editProfile.scheduling.notice2}
                  unit={t.editProfile.scheduling.days} min={0} max={14}
                  value={values.noticeRequiredDays} onChange={(v) => setValue('noticeRequiredDays', v)}
                  hints={<p className="field-hint">{t.editProfile.scheduling.notice2Hint}</p>}
                />
              </section>
            </div>
          </div>

          <CompletedWorkPanel
            entries={values.work}
            lede={t.editProfile.work.lede}
            manage={{
              addLabel: t.editProfile.work.add,
              editLabel: t.editProfile.work.edit,
              removeLabel: t.editProfile.work.remove,
              onAdd: () => { setWorkForm('new'); setWorkError(null); },
              onEdit: (entry) => { setWorkForm(entry); setWorkError(null); },
              onRemove: (id) => void dropWork(id),
            }}
            notice={
              <>
                {workForm ? (
                  <WorkEntryForm
                    key={workForm === 'new' ? 'new' : workForm.id}
                    entry={workForm === 'new' ? null : workForm}
                    onSubmit={(fields, image) => void saveWork(workForm, fields, image)}
                    onCancel={() => setWorkForm(null)}
                    busy={workBusy}
                    error={workError}
                  />
                ) : null}
                {!workForm && workError ? (
                  <p className="field-error field-error--visible" role="alert">{workError}</p>
                ) : null}
              </>
            }
          />

          <RatingsPanel
            ratings={profile.ratings}
            lede={t.editProfile.ratingsLede.replace('{count}', String(profile.ratings.length))}
          />

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={saving} aria-busy={saving}>
              {t.editProfile.actions.save}
              {saving ? <ButtonSpinner /> : null}
            </button>
            <button
              type="button" className="btn btn--ghost"
              onClick={() => { clearSaved(); navigate('/profile'); }}
            >
              {t.editProfile.actions.cancel}
            </button>
            <p
              className={`form-actions__aside${blocked || saveFailure ? ' form-actions__aside--error' : ''}`}
              role={blocked || saveFailure ? 'alert' : 'status'}
            >
              {saveMessage}
            </p>
          </div>
        </form>

        <EquipmentPicker
          open={equipmentOpen}
          selected={values.equipment}
          onToggle={toggleEquipment}
          onClose={() => setEquipmentOpen(false)}
        />
      </main>
    </div>
  );
};
