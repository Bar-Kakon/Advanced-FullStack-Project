import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { useScheduleExceptions } from './useScheduleExceptions';
import type { ExceptionKind, ExceptionScope } from '../../api/scheduleExceptions.types';
import profileCss from '../profile/profile.css?inline';
import exceptionsCss from './schedule-exceptions.css?inline';

/**
 * The exception layer for one project.
 *
 * There is no holiday automation and no generated calendar: the day strip renders only the dates
 * an approved request actually changed, and the page says in words why nothing is populated for
 * anybody.
 */
export const ScheduleExceptionsPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { data, loading, busy, failure, submit, decide, withdraw, modify } =
    useScheduleExceptions(projectId);

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'schedule-exceptions.css', css: exceptionsCss },
  );
  useDocumentTitle(t.scheduleExceptions.documentTitle);

  const [kind, setKind] = useState<ExceptionKind>('non_working');
  const [scope, setScope] = useState<ExceptionScope>('professional');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');

  const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
  const mayApprove = data?.mayApprove === true;

  const send = async (): Promise<void> => {
    if (fromDate.length === 0 || toDate.length === 0) return;
    const sent = await submit({
      kind,
      scope,
      fromDate,
      toDate,
      ...(reason.trim().length === 0 ? {} : { reason: reason.trim() }),
    });
    if (sent) {
      setFromDate('');
      setToDate('');
      setReason('');
    }
  };

  return (
    <>
      <AppNav name={name} initials={initialsOf(user?.firstName ?? '', user?.lastName ?? '')} />

      <main className="profile-main">
        <header className="profile-header">
          <h1 className="profile-title">{t.scheduleExceptions.title}</h1>
          <p className="profile-lede">{t.scheduleExceptions.lede}</p>
        </header>

        <p className="exc-note">{t.scheduleExceptions.noHolidayNote}</p>

        {failure === null ? null : (
          <FormAlert message={failure === 'network'
              ? t.scheduleExceptions.errors.network
              : failure === 'load'
                ? t.scheduleExceptions.errors.load
                : t.scheduleExceptions.errors[failure]} />
        )}

        <section className="exc-panel" aria-labelledby="exc-new">
          <h2 className="exc-panel__title" id="exc-new">{t.scheduleExceptions.newTitle}</h2>
          <p className="exc-panel__note">{t.scheduleExceptions.forSelfNote}</p>

          <div className="exc-form">
            <div className="form-group">
              <label className="form-label" htmlFor="exc-kind">{t.scheduleExceptions.kind}</label>
              <select
                id="exc-kind"
                className="form-input"
                value={kind}
                onChange={(event) => setKind(event.target.value as ExceptionKind)}
              >
                <option value="non_working">{t.scheduleExceptions.kinds.non_working}</option>
                <option value="working">{t.scheduleExceptions.kinds.working}</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="exc-scope">{t.scheduleExceptions.scope}</label>
              <select
                id="exc-scope"
                className="form-input"
                value={scope}
                onChange={(event) => setScope(event.target.value as ExceptionScope)}
              >
                <option value="professional">{t.scheduleExceptions.scopes.professional}</option>
                {/* Offered only where the grant exists, because it is not a request for oneself. */}
                {mayApprove ? (
                  <option value="project">{t.scheduleExceptions.scopes.project}</option>
                ) : null}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="exc-from">{t.scheduleExceptions.fromDate}</label>
              <input
                id="exc-from"
                className="form-input"
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="exc-to">{t.scheduleExceptions.toDate}</label>
              <input
                id="exc-to"
                className="form-input"
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </div>

            <div className="form-group exc-form__wide">
              <label className="form-label" htmlFor="exc-reason">{t.scheduleExceptions.reason}</label>
              <input
                id="exc-reason"
                className="form-input"
                type="text"
                maxLength={600}
                placeholder={t.scheduleExceptions.reasonPlaceholder}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || fromDate.length === 0 || toDate.length === 0}
            onClick={() => void send()}
          >
            {t.scheduleExceptions.submit}
            {busy ? <ButtonSpinner /> : null}
          </button>
        </section>

        <section className="exc-panel" aria-labelledby="exc-days">
          <h2 className="exc-panel__title" id="exc-days">{t.scheduleExceptions.calendarTitle}</h2>
          {(data?.effectiveDays ?? []).length === 0 ? (
            <p className="exc-panel__note">{t.scheduleExceptions.calendarEmpty}</p>
          ) : (
            <div className="exc-days">
              {(data?.effectiveDays ?? []).map((day) => (
                <span
                  key={day.date}
                  className={`exc-day ${day.working ? 'exc-day--working' : 'exc-day--off'}`}
                >
                  <span className="exc-day__label">{day.date}</span>
                  <span>
                    {day.working
                      ? t.scheduleExceptions.dayWorking
                      : t.scheduleExceptions.dayNonWorking}
                  </span>
                </span>
              ))}
            </div>
          )}
        </section>

        {loading ? (
          <p className="exc-empty">{t.scheduleExceptions.loading}</p>
        ) : (data?.exceptions ?? []).length === 0 ? (
          <p className="exc-empty">{t.scheduleExceptions.empty}</p>
        ) : (
          <ul className="exc-list">
            {(data?.exceptions ?? []).map((row) => {
              const pending = row.status === 'requested';
              return (
                <li key={row.id} className={`exc-row${pending ? ' exc-row--pending' : ''}`}>
                  <div className="exc-row__head">
                    <h2 className="exc-row__title">{t.scheduleExceptions.kinds[row.kind]}</h2>
                    <span className="exc-row__dates">
                      {row.fromDate === row.toDate ? row.fromDate : `${row.fromDate} – ${row.toDate}`}
                    </span>
                    <span className={`exc-chip${pending ? ' exc-chip--pending' : ''}`}>
                      {t.scheduleExceptions.statuses[row.status]}
                    </span>
                    <span className="exc-chip">{t.scheduleExceptions.scopes[row.scope]}</span>
                  </div>

                  <p className="exc-row__meta">
                    {t.scheduleExceptions.requestedBy}: <span dir="auto">{row.requestedByName}</span>
                    {row.reason === null ? null : <> · <span dir="auto">{row.reason}</span></>}
                    {row.decidedByName === null ? null : (
                      <>
                        <br />
                        {t.scheduleExceptions.decidedBy}: <span dir="auto">{row.decidedByName}</span>
                      </>
                    )}
                  </p>

                  {row.history.length === 0 ? null : (
                    <div className="exc-history">
                      <h3 className="exc-history__title">{t.scheduleExceptions.historyTitle}</h3>
                      <ul className="exc-history__list">
                        {row.history.map((entry, index) => (
                          <li className="exc-history__entry" key={`${entry.at}-${index}`}>
                            <span dir="auto">{entry.byName}</span>{' '}
                            {t.scheduleExceptions.actions[entry.action]}
                            {entry.fromDate === null ? null : ` · ${entry.fromDate}`}
                            {entry.toDate === null || entry.toDate === entry.fromDate
                              ? null
                              : ` – ${entry.toDate}`}
                            {entry.note === null ? null : <> · <span dir="auto">{entry.note}</span></>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {row.canApprove || row.canModify || row.canCancel ? (
                    <div className="exc-row__actions">
                      {row.canApprove ? (
                        <>
                          <button
                            type="button"
                            className="btn btn--primary"
                            disabled={busy}
                            onClick={() => void decide(row.id, true)}
                          >
                            {t.scheduleExceptions.approve}
                            {busy ? <ButtonSpinner /> : null}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            disabled={busy}
                            onClick={() => void decide(row.id, false)}
                          >
                            {t.scheduleExceptions.reject}
                          </button>
                        </>
                      ) : null}

                      {row.canModify ? (
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={busy || fromDate.length === 0 || toDate.length === 0}
                          onClick={() => void modify(row.id, { fromDate, toDate })}
                        >
                          {t.scheduleExceptions.modify}
                        </button>
                      ) : null}

                      {row.canCancel ? (
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={busy}
                          onClick={() => void withdraw(row.id)}
                        >
                          {t.scheduleExceptions.cancel}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {row.canModify ? (
                    <p className="exc-row__meta">{t.scheduleExceptions.modifyNote}</p>
                  ) : null}
                  {row.canApprove ? (
                    <p className="exc-row__meta">{t.scheduleExceptions.finalNote}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
};
