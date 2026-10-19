import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  classifyCompanyCalendarError,
  fetchCompanyCalendar,
  fetchOutdatedCalendars,
  saveCompanyCalendar,
  type CompanyCalendar,
  type CompanyCalendarFailure,
  type OutdatedCalendars,
} from '../../api/calendar.api';
import { SECTORS, WEEKDAYS, type Sector, type WorkingCalendarConfig } from '../../api/projects.types';
import { useAuth } from '../../auth/useAuth';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { formatInstantDate } from '../../i18n/dateFormat';
import { useLanguage } from '../../i18n/useLanguage';

const asTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const asMinutes = (value: string): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes <= 1440 ? minutes : null;
};

const sameConfig = (a: WorkingCalendarConfig, b: WorkingCalendarConfig): boolean =>
  WEEKDAYS.every((day) => a.workingDays.includes(day) === b.workingDays.includes(day)) &&
  a.hours.startMinute === b.hours.startMinute &&
  a.hours.endMinute === b.hours.endMinute &&
  a.sector === b.sector &&
  a.worksCholHaMoed === b.worksCholHaMoed &&
  a.worksMemorialDays === b.worksMemorialDays;

export const CompanyCalendarSection = () => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const copy = t.settings.companyCalendar;
  const dayNames = t.projects.calendar.days;

  const company = user?.company ?? null;
  const active = company !== null && company.membershipStatus === 'active';
  const canEdit = active && company.permissions.includes('company.manage');

  const [calendar, setCalendar] = useState<CompanyCalendar | null>(null);
  const [outdated, setOutdated] = useState<OutdatedCalendars | null>(null);
  const [draft, setDraft] = useState<WorkingCalendarConfig | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CompanyCalendarFailure | null>(null);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);

  const load = async (signal?: AbortSignal): Promise<void> => {
    const loaded = await fetchCompanyCalendar(signal);
    setCalendar(loaded);
    setDraft(loaded.current.config);
    setStart(asTime(loaded.current.config.hours.startMinute));
    setEnd(asTime(loaded.current.config.hours.endMinute));
    setOutdated(await fetchOutdatedCalendars(signal).catch(() => null));
  };

  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    load(controller.signal).catch(() => {
      if (!controller.signal.aborted) setLoadFailed(true);
    });
    return () => controller.abort();
  }, [active]);

  const startMinute = asMinutes(start);
  const endMinute = asMinutes(end);
  const hoursValid = startMinute !== null && endMinute !== null && endMinute > startMinute;

  const next = useMemo<WorkingCalendarConfig | null>(
    () =>
      draft === null || !hoursValid
        ? null
        : { ...draft, hours: { startMinute: startMinute as number, endMinute: endMinute as number } },
    [draft, hoursValid, startMinute, endMinute],
  );
  const changed = next !== null && calendar !== null && !sameConfig(next, calendar.current.config);

  if (!active) return null;

  const toggleDay = (day: (typeof WEEKDAYS)[number]): void => {
    if (draft === null) return;
    const workingDays = draft.workingDays.includes(day)
      ? draft.workingDays.filter((d) => d !== day)
      : WEEKDAYS.filter((d) => d === day || draft.workingDays.includes(d));
    setDraft({ ...draft, workingDays });
    setSavedVersion(null);
  };

  const save = async (): Promise<void> => {
    if (next === null || !changed || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const saved = await saveCompanyCalendar(next);
      setSavedVersion(saved.version);
      await load();
    } catch (error) {
      setFailure(classifyCompanyCalendarError(error));
    } finally {
      setBusy(false);
    }
  };

  const summary = (config: WorkingCalendarConfig): string =>
    `${config.workingDays.map((day) => dayNames[day]).join(' · ')} · ${asTime(config.hours.startMinute)}–${asTime(config.hours.endMinute)}`;

  const currentVersion = calendar?.versions.find((v) => v.versionId === calendar.current.versionId) ?? null;
  const failureMessage =
    failure === 'NOT_PERMITTED' ? copy.notPermitted
    : failure === 'INVALID' ? copy.hoursOrder
    : failure === 'NETWORK' ? t.settings.errors.network
    : failure !== null ? copy.saveFailed
    : null;

  return (
    <section className="settings-section" aria-labelledby="settings-company-calendar" data-testid="company-calendar">
      <h2 className="settings-section__title" id="settings-company-calendar">{copy.title}</h2>
      <p className="settings-section__note">{copy.lede}</p>

      {loadFailed ? <FormAlert message={copy.loadFailed} /> : null}

      {calendar === null || draft === null ? null : (
        <>
          <p className="settings-section__note settings-section__note--strong" data-testid="company-calendar-version">
            {currentVersion === null
              ? copy.defaultVersion
              : copy.version
                  .replace('{version}', String(currentVersion.version))
                  .replace('{date}', formatInstantDate(currentVersion.createdAt, lang))}
          </p>

          {canEdit ? (
            <form
              className="settings-calendar-form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <fieldset className="settings-calendar__days">
                <legend className="settings-calendar__legend">{copy.workingDays}</legend>
                {WEEKDAYS.map((day) => (
                  <label className="settings-choice" key={day}>
                    <input
                      type="checkbox"
                      name={`day-${day}`}
                      checked={draft.workingDays.includes(day)}
                      onChange={() => toggleDay(day)}
                    />
                    <span className="settings-choice__label">{dayNames[day]}</span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="settings-calendar__hours">
                <legend className="settings-calendar__legend">{copy.hours}</legend>
                <label className="settings-calendar__field">
                  <span>{copy.start}</span>
                  <input
                    className="form-input"
                    type="time"
                    step={900}
                    id="company-calendar-start"
                    dir="ltr"
                    value={start}
                    onChange={(event) => {
                      setStart(event.target.value);
                      setSavedVersion(null);
                    }}
                  />
                </label>
                <label className="settings-calendar__field">
                  <span>{copy.end}</span>
                  <input
                    className="form-input"
                    type="time"
                    step={900}
                    id="company-calendar-end"
                    dir="ltr"
                    value={end}
                    onChange={(event) => {
                      setEnd(event.target.value);
                      setSavedVersion(null);
                    }}
                  />
                </label>
              </fieldset>
              {hoursValid ? null : (
                <p className="field-error field-error--visible" aria-live="polite">{copy.hoursOrder}</p>
              )}

              <label className="settings-calendar__field">
                <span>{copy.sector}</span>
                <select
                  className="form-input"
                  id="company-calendar-sector"
                  value={draft.sector}
                  onChange={(event) => {
                    setDraft({ ...draft, sector: event.target.value as Sector });
                    setSavedVersion(null);
                  }}
                >
                  {SECTORS.map((sector) => (
                    <option key={sector} value={sector}>{copy.sectors[sector]}</option>
                  ))}
                </select>
              </label>

              <label className="settings-choice">
                <input
                  type="checkbox"
                  id="company-calendar-chol-hamoed"
                  checked={draft.worksCholHaMoed}
                  onChange={(event) => setDraft({ ...draft, worksCholHaMoed: event.target.checked })}
                />
                <span className="settings-choice__label">{copy.worksCholHaMoed}</span>
              </label>
              <label className="settings-choice">
                <input
                  type="checkbox"
                  id="company-calendar-memorial"
                  checked={draft.worksMemorialDays}
                  onChange={(event) => setDraft({ ...draft, worksMemorialDays: event.target.checked })}
                />
                <span className="settings-choice__label">{copy.worksMemorialDays}</span>
              </label>

              <p className="settings-section__note" role="note" data-testid="company-calendar-limitation">
                {copy.limitation}
              </p>

              {failureMessage === null ? null : <FormAlert message={failureMessage} />}
              {savedVersion === null ? null : (
                <p className="settings-saved" role="status" data-testid="company-calendar-saved">
                  {copy.saved.replace('{version}', String(savedVersion))}
                </p>
              )}

              <button
                type="submit"
                className="btn btn--primary"
                id="company-calendar-save"
                disabled={!changed || busy}
                aria-busy={busy}
              >
                {copy.save}
                {busy ? <ButtonSpinner /> : null}
              </button>
            </form>
          ) : (
            <>
              <dl className="settings-calendar__facts" data-testid="company-calendar-readonly">
                <dt>{copy.workingDays}</dt>
                <dd>{draft.workingDays.map((day) => dayNames[day]).join(' · ')}</dd>
                <dt>{copy.hours}</dt>
                <dd dir="ltr">{`${asTime(draft.hours.startMinute)}–${asTime(draft.hours.endMinute)}`}</dd>
                <dt>{copy.sector}</dt>
                <dd>{copy.sectors[draft.sector]}</dd>
                <dt>{copy.worksCholHaMoed}</dt>
                <dd>{draft.worksCholHaMoed ? copy.yes : copy.no}</dd>
                <dt>{copy.worksMemorialDays}</dt>
                <dd>{draft.worksMemorialDays ? copy.yes : copy.no}</dd>
              </dl>
              <p className="settings-section__note" role="note">{copy.limitation}</p>
              <p className="settings-section__note">{copy.readOnly}</p>
            </>
          )}

          {calendar.versions.length === 0 ? null : (
            <>
              <h3 className="settings-section__title">{copy.history}</h3>
              <ul className="settings-calendar__history" data-testid="company-calendar-history">
                {[...calendar.versions].reverse().map((version) => (
                  <li key={version.versionId}>
                    <span>{copy.outdatedItem.replace('{version}', String(version.version))}</span>
                    {' · '}
                    <span>{formatInstantDate(version.createdAt, lang)}</span>
                    {' · '}
                    <span>{summary(version.config)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {outdated === null ? null : (
            <div data-testid="company-calendar-outdated">
              <p className="settings-section__note">
                {outdated.outdated === 0
                  ? copy.outdatedNone
                  : copy.outdatedCount.replace('{count}', String(outdated.outdated))}
              </p>
              {outdated.projects === null || outdated.projects.length === 0 ? null : (
                <ul className="settings-calendar__outdated">
                  {outdated.projects.map((project) => (
                    <li key={project.id}>
                      <Link to={`/projects/${project.id}`} dir="auto">{project.name}</Link>
                      {project.versionNumber === null
                        ? null
                        : ` · ${copy.outdatedItem.replace('{version}', String(project.versionNumber))}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
};
