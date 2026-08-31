import { useState } from 'react';

import {
  COMPANY_POSITIONS,
  COMPANY_STANDINGS,
  DRILLING_SPECIALTY,
  DRILLING_TYPES,
  REGIONS,
  REGISTRATION_CATEGORIES,
  SPECIALTIES_BY_CATEGORY,
  type CompanyPosition,
  type CompanyStanding,
  type Region,
  type RegistrationCategory,
  type Specialty,
} from '../../api/types';
import { useLanguage } from '../../i18n/useLanguage';
import {
  MIN_PASSWORD_LENGTH,
  REGISTER_STEPS,
  type FieldName,
  type useRegisterForm,
} from './useRegisterForm';
import { isOtherSpecialty } from './buildRegisterPayload';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FieldLabel } from '../../components/FieldLabel';
import { FormAlert } from '../../components/FormAlert';
import { PasswordField } from '../../components/PasswordField';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { AvailabilityChoice } from './components/AvailabilityChoice';
import { ContractorCategoryChoice } from './components/ContractorCategoryChoice';
import { EmailNotificationChoice } from './components/EmailNotificationChoice';
import { TermsCheckbox } from './components/TermsCheckbox';
import { TermsModal } from './components/TermsModal';
import { LocationField } from '../../location/LocationField';

/** Bounds copied from the endpoint's schema, so the box refuses what the server would reject. */
const MAX = {
  name: 100, companyName: 120, email: 254, city: 80, phone: 30, password: 200, specialtyOther: 60,
} as const;

export const RegisterForm = ({ form }: { form: ReturnType<typeof useRegisterForm> }) => {
  const { t } = useLanguage();
  // Held here rather than in `useRegisterForm`: reading the terms is not an answer the form
  // collects, so opening the document never touches a value the payload is built from.
  const [termsOpen, setTermsOpen] = useState(false);
  const {
    values, setValue, setStanding, setCategory, setSpecialty, toggleDrillingType,
    touched, markTouched, errors,
    step, goNext, goBack, detailsComplete, isComplete, submitting, failure, viaGoogle,
  } = form;

  const alertMessage =
    failure === 'EMAIL_ALREADY_REGISTERED' ? t.errors.emailTaken
    : failure === 'REQUEST_VALIDATION_FAILED' ? t.errors.validation
    : failure === 'INVITATION_NOT_FOUND' ? t.errors.noInvitation
    : failure === 'INVITATION_AMBIGUOUS' ? t.errors.ambiguousInvitation
    : failure === 'NETWORK' ? t.errors.network
    : failure ? t.errors.generic
    : null;

  /**
   * A field shows its error only once the person has been in it and left something wrong behind.
   * Both halves matter: without `touched` a pristine form is red on arrival, and without the issue
   * a field that has since been corrected stays red after it is already valid.
   */
  const shows = (field: FieldName): boolean => !!touched[field] && errors[field] !== undefined;

  /**
   * The wording for whatever is wrong with one field. `formatText` is the field's own sentence
   * about its shape; the other three answers are the same on every field that can give them.
   */
  const issueText = (field: FieldName, formatText?: string): string | undefined => {
    switch (errors[field]) {
      case 'required':
        return t.form.required;
      case 'tooShort':
        return t.form.password.error;
      case 'mismatch':
        return t.form.confirmPassword.error;
      case 'format':
        return formatText;
      default:
        return undefined;
    }
  };

  /** `exactOptionalPropertyTypes` refuses `error={undefined}`, so the prop is spread or absent. */
  const errorProps = (field: FieldName, formatText?: string): { error?: string } => {
    const text = issueText(field, formatText);
    return text === undefined ? {} : { error: text };
  };

  /** An employee claims a seat their employer opened; an owner creates the business. */
  const isEmployee = values.standing === 'employee';
  const onDetails = step === 'details';

  // Option lists pair a language-neutral code with the label for the language on screen. Built
  // here rather than stored, so switching language relabels them without touching any value.
  const categoryOptions = REGISTRATION_CATEGORIES.map((code) => ({
    value: code, label: t.specialtyCategories[code],
  }));
  const regionOptions = REGIONS.map((code) => ({ value: code, label: t.regions[code] }));
  const standingOptions = COMPANY_STANDINGS.map((code) => ({ value: code, label: t.form.standing[code] }));
  const positionOptions = COMPANY_POSITIONS.map((code) => ({ value: code, label: t.companyPositions[code] }));

  // Only the chosen route's own taxonomy is offered, which is the same list the server accepts.
  const specialtyOptions = values.registrationCategory === ''
    ? []
    : SPECIALTIES_BY_CATEGORY[values.registrationCategory].map((code) => ({
        value: code as Specialty, label: t.specialties[code],
      }));

  const stepNumber = REGISTER_STEPS.indexOf(step) + 1;

  return (
    <>
      {alertMessage ? <FormAlert message={alertMessage} /> : null}

      <ol className="reg-steps" aria-label={t.form.steps.label}>
        {REGISTER_STEPS.map((name, index) => (
          <li
            key={name}
            className={`reg-steps__item${step === name ? ' reg-steps__item--current' : ''}`}
            {...(step === name ? { 'aria-current': 'step' as const } : {})}
          >
            <span className="reg-steps__num">{index + 1}</span>
            <span className="reg-steps__label">{t.form.steps[name]}</span>
          </li>
        ))}
      </ol>
      <p className="reg-steps__count">
        {t.form.steps.of.replace('{current}', String(stepNumber)).replace('{total}', String(REGISTER_STEPS.length))}
      </p>

      {/* onSubmit rather than a click handler: it also fires on Enter in a text field, which is
          how people actually submit a form. preventDefault stops the browser's own navigation. */}
      <form
        className="register-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (onDetails) {
            if (detailsComplete) goNext();
            return;
          }
          void form.submit();
        }}
      >
        {onDetails ? (
          <>
            {/* Asked first: it decides which taxonomy the specialty field below offers. */}
            <SelectField<RegistrationCategory>
              className="col--full" id="registrationCategory" label={t.form.registrationCategory.label}
              placeholder={t.form.registrationCategory.placeholder} options={categoryOptions} required
              hint={t.form.registrationCategory.hint}
              value={values.registrationCategory}
              onChange={(v) => { if (v) setCategory(v); }}
              onBlur={() => markTouched('registrationCategory')}
              touched={!!touched.registrationCategory}
              invalid={shows('registrationCategory')}
              {...errorProps('registrationCategory')}
            />

            <TextField
              className="col--half" id="firstName" label={t.form.firstName.label}
              placeholder={t.form.firstName.placeholder} autoComplete="given-name" maxLength={MAX.name} required
              value={values.firstName} onChange={(v) => setValue('firstName', v)}
              onBlur={() => markTouched('firstName')} touched={!!touched.firstName}
              invalid={shows('firstName')}
              {...errorProps('firstName', t.form.firstName.error)}
            />
            <TextField
              className="col--half" id="lastName" label={t.form.lastName.label}
              placeholder={t.form.lastName.placeholder} autoComplete="family-name" maxLength={MAX.name} required
              value={values.lastName} onChange={(v) => setValue('lastName', v)}
              onBlur={() => markTouched('lastName')} touched={!!touched.lastName}
              invalid={shows('lastName')}
              {...errorProps('lastName', t.form.lastName.error)}
            />
            {/* Standing decides what the rest of the form means, so it is asked before the fields it
                governs. It is organizational standing only — never a permission or a job title. */}
            <SelectField<CompanyStanding>
              className="col--full" id="standing" label={t.form.standing.label}
              placeholder={t.form.standing.placeholder} options={standingOptions} required
              {...(isEmployee ? { hint: t.form.standing.employeeHint } : {})}
              value={values.standing} onChange={(v) => { if (v) setStanding(v); }}
            />

            <TextField
              className={isEmployee ? 'col--half' : 'col--full'} id="companyName" label={t.form.companyName.label}
              placeholder={t.form.companyName.placeholder} autoComplete="organization" maxLength={MAX.companyName} required
              value={values.companyName} onChange={(v) => setValue('companyName', v)}
              onBlur={() => markTouched('companyName')} touched={!!touched.companyName}
              invalid={shows('companyName')}
              {...errorProps('companyName', t.form.companyName.error)}
            />

            {/* One of the three values the server matches the invitation on. Typing a company name is
                not proof of employment, and neither is this — the seat has to already exist. */}
            {isEmployee ? (
              <SelectField<CompanyPosition>
                className="col--half" id="companyPosition" label={t.form.companyPosition.label}
                placeholder={t.form.companyPosition.placeholder} options={positionOptions} required
                value={values.companyPosition} onChange={(v) => setValue('companyPosition', v)}
                onBlur={() => markTouched('companyPosition')} touched={!!touched.companyPosition}
                invalid={shows('companyPosition')}
                {...errorProps('companyPosition')}
              />
            ) : null}
            <TextField
              className="col--half" id="email" label={t.form.email.label} type="email" dir="ltr"
              placeholder={t.form.email.placeholder} autoComplete="email" maxLength={MAX.email} required
              // The address Google verified is the one the account is opened for, and the server
              // refuses any other, so it is not offered as an editable field.
              {...(viaGoogle ? { readOnly: true } : {})}
              value={values.email} onChange={(v) => setValue('email', v)}
              onBlur={() => markTouched('email')} touched={!!touched.email}
              invalid={shows('email')}
              {...errorProps('email', t.form.email.error)}
            />

            {/* Absent until a route is chosen: there is no list to show before then. */}
            {values.registrationCategory === '' ? null : (
              <SelectField<Specialty>
                className="col--half" id="specialty" label={t.form.specialty.label}
                placeholder={t.form.specialty.placeholder} options={specialtyOptions} required
                hint={t.form.specialty.hint}
                value={values.specialty} onChange={(v) => setSpecialty(v)}
                onBlur={() => markTouched('specialty')} touched={!!touched.specialty}
                invalid={shows('specialty')}
                {...errorProps('specialty')}
              >
                {/* Revealed by the value rather than by a CSS `:has()` on the checked option — same
                    condition the server enforces, which is why it can never send a stale value. */}
                {isOtherSpecialty(values.registrationCategory, values.specialty) ? (
                  <div className="other-trade other-trade--visible">
                    <FieldLabel plain text={t.form.specialtyOther.label} />
                    <input
                      className={`form-input${shows('specialtyOther') ? ' touched is-invalid' : ''}`}
                      type="text" name="specialtyOther"
                      aria-invalid={shows('specialtyOther')}
                      maxLength={MAX.specialtyOther} placeholder={t.form.specialtyOther.placeholder}
                      value={values.specialtyOther}
                      onChange={(e) => setValue('specialtyOther', e.target.value)}
                      onBlur={() => markTouched('specialtyOther')}
                    />
                    {shows('specialtyOther') ? (
                      <p className="field-error field-error--visible" aria-live="polite">
                        {issueText('specialtyOther', t.form.specialtyOther.error)}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* The nested drilling subtype, offered only under the profession that carries it. */}
                {values.specialty === DRILLING_SPECIALTY ? (
                  <div className="other-trade other-trade--visible">
                    <FieldLabel plain text={t.form.drillingTypes.label} />
                    {DRILLING_TYPES.map((code) => (
                      <label className="avail-option" key={code} htmlFor={`drillingTypes-${code}`}>
                        <input
                          className="avail-option__input" id={`drillingTypes-${code}`}
                          type="checkbox" name="drillingTypes" value={code}
                          checked={values.drillingTypes.includes(code)}
                          onChange={(e) => toggleDrillingType(code, e.target.checked)}
                        />
                        <span className="avail-option__box" aria-hidden="true">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                               strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        </span>
                        <span className="email-choice__label">{t.drillingTypes[code]}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </SelectField>
            )}

            {/* City, region and the two phones share one grid cell, stacked. */}
            <div className="field-stack col--half">
              <LocationField
                label={t.form.city.label}
                placeholder={t.form.city.placeholder}
                place={values.place}
                city={values.city}
                onPlace={(place) => { setValue('place', place); markTouched('city'); }}
                onCity={(city) => { setValue('city', city); markTouched('city'); }}
                required
                invalid={shows('city')}
                {...errorProps('city', t.form.city.error)}
              />
              <SelectField<Region>
                id="region" label={t.form.region.label} placeholder={t.form.region.placeholder}
                options={regionOptions} required
                value={values.region} onChange={(v) => setValue('region', v)}
                onBlur={() => markTouched('region')} touched={!!touched.region}
                invalid={shows('region')}
                {...errorProps('region')}
              />
              {/* Two independent numbers. Each is optional on its own, and neither is derived from
                  the other — they are stored on two different documents server-side. The office line
                  belongs to the business, so only somebody creating one is asked for it. */}
              {isEmployee ? null : (
                <TextField
                  id="officePhone" label={t.form.officePhone.label} optionalText={t.form.optional}
                  type="tel" dir="ltr" placeholder={t.form.officePhone.placeholder}
                  autoComplete="work tel" maxLength={MAX.phone}
                  value={values.officePhone} onChange={(v) => setValue('officePhone', v)}
                  onBlur={() => markTouched('officePhone')} touched={!!touched.officePhone}
                  invalid={shows('officePhone')}
                  {...errorProps('officePhone', t.form.officePhone.error)}
                />
              )}
              <TextField
                id="businessPhone" label={t.form.businessPhone.label} optionalText={t.form.optional}
                type="tel" dir="ltr" placeholder={t.form.businessPhone.placeholder}
                autoComplete="tel" maxLength={MAX.phone}
                value={values.businessPhone} onChange={(v) => setValue('businessPhone', v)}
                onBlur={() => markTouched('businessPhone')} touched={!!touched.businessPhone}
                invalid={shows('businessPhone')}
                {...errorProps('businessPhone', t.form.businessPhone.error)}
              />
            </div>

            {/* Availability is the organization's, set by whoever runs it — so an employee is not
                asked, and the server refuses the field on that path anyway. */}
            {/* Account level, so only the person creating the business answers it. An employee
                inherits their company's, and the server refuses the field on that path. */}
            {isEmployee ? null : (
              <ContractorCategoryChoice
                legend={t.form.contractorCategory.label} hint={t.form.contractorCategory.hint}
                labels={t.contractorCategories}
                value={values.contractorCategory}
                onChange={(v) => setValue('contractorCategory', v)}
                onBlur={() => markTouched('contractorCategory')}
                invalid={shows('contractorCategory')}
                {...errorProps('contractorCategory')}
              />
            )}

            {isEmployee ? null : (
              <AvailabilityChoice
                legend={t.form.availability.label} hint={t.form.availability.hint}
                labels={t.availability}
                value={values.availability} onChange={(v) => setValue('availability', v)}
              />
            )}

            {/* A Google account is opened with no password, so the fields are absent rather than
                shown and ignored — there is nothing here for the person to fill in or to lose. */}
            {viaGoogle ? (
              <p className="form-note col--full">{t.form.googleOnboarding.noPassword}</p>
            ) : (
              <>
                <PasswordField
                  className="col--half"
                  id="password" name="password" label={t.form.password.label} placeholder={t.form.password.placeholder}
                  hint={t.form.password.hint} toggleLabel={t.form.togglePassword}
                  minLength={MIN_PASSWORD_LENGTH} maxLength={MAX.password}
                  value={values.password} onChange={(v) => setValue('password', v)}
                  onBlur={() => markTouched('password')} touched={!!touched.password}
                  invalid={shows('password')}
                  {...errorProps('password')}
                />
                <PasswordField
                  className="col--half"
                  id="password-confirm" name="confirmPassword" label={t.form.confirmPassword.label}
                  placeholder={t.form.confirmPassword.placeholder} toggleLabel={t.form.togglePassword}
                  maxLength={MAX.password}
                  value={values.confirmPassword} onChange={(v) => setValue('confirmPassword', v)}
                  onBlur={() => markTouched('confirmPassword')} touched={!!touched.confirmPassword}
                  invalid={shows('confirmPassword')}
                  {...errorProps('confirmPassword')}
                />
              </>
            )}

            <button
              type="submit"
              className="btn btn--primary btn--full col--full"
              id="register-next"
              disabled={!detailsComplete}
            >
              {t.form.steps.next}
            </button>
          </>
        ) : (
          <>
            <EmailNotificationChoice
              copy={t.form.emailNotifications}
              value={values.operationalEmail}
              onChange={(v) => setValue('operationalEmail', v)}
            />

            <TermsCheckbox
              terms={t.form.terms} checked={values.acceptedTerms}
              // Marked touched on the change rather than only on the blur: a checkbox has no
              // half-answered state, so unticking consent should say why submit went away.
              onChange={(v) => { setValue('acceptedTerms', v); markTouched('acceptedTerms'); }}
              onBlur={() => markTouched('acceptedTerms')} touched={!!touched.acceptedTerms}
              invalid={shows('acceptedTerms')}
              {...(shows('acceptedTerms') ? { error: t.form.terms.error } : {})}
              onOpenTerms={() => setTermsOpen(true)}
            />

            <div className="reg-nav col--full">
              <button type="button" className="btn btn--ghost" id="register-back" onClick={goBack}>
                {t.form.steps.back}
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={!isComplete || submitting}
                aria-busy={submitting}
              >
                {t.form.submit}
                {submitting ? <ButtonSpinner /> : null}
              </button>
            </div>
          </>
        )}
      </form>

      {/* Outside the <form>: a dialog nested in it would submit Register on any stray Enter. */}
      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </>
  );
};
