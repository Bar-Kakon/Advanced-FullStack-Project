import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { StatusPill } from './components/StatusPill';
import { useReportDetail } from './useReportDetail';
import { REPORT_REASONS, type ReportReason } from '../../api/reports.types';
import profileCss from '../profile/profile.css?inline';
import moderationCss from './moderation.css?inline';

const isReason = (value: string): value is ReportReason =>
  (REPORT_REASONS as readonly string[]).includes(value);

const ACCOUNT_STATUSES = ['active', 'restricted', 'deactivated', 'banned', 'deleted'] as const;
const isAccountStatus = (value: string): value is (typeof ACCOUNT_STATUSES)[number] =>
  (ACCOUNT_STATUSES as readonly string[]).includes(value);

const HISTORY_ACTIONS = [
  'report.submitted',
  'report.claimed',
  'report.dismissed',
  'report.actioned',
  'account.restricted',
  'account.unrestricted',
] as const;
const isHistoryAction = (value: string): value is (typeof HISTORY_ACTIONS)[number] =>
  (HISTORY_ACTIONS as readonly string[]).includes(value);

/**
 * One report, everything moderation needs to decide it, and nothing more. It shows the account
 * under review and the reporter's own words; it does not pull in that person's projects, tasks or
 * work plans, because none of those is evidence for a profile report.
 */
export const ReportDetailPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { reportId = '' } = useParams<{ reportId: string }>();
  const { report, loading, busy, failure, claim, resolve, act } = useReportDetail(reportId);

  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [reasonMissing, setReasonMissing] = useState(false);

  useScreenStylesheet({ id: 'profile.css', css: profileCss }, { id: 'moderation.css', css: moderationCss });
  useDocumentTitle(t.moderation.detailDocumentTitle);

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';

  const message =
    failure === 'ALREADY_RESOLVED' ? t.moderation.errors.alreadyResolved
      : failure === 'NOT_APPLICABLE' ? t.moderation.account.notApplicable
        : failure === 'NOT_FOUND' ? t.moderation.errors.notFound
          : failure === 'NETWORK' ? t.moderation.errors.network
            : t.moderation.errors.unknown;

  const runAccountAction = (action: 'restrict' | 'unrestrict'): void => {
    if (reason.trim() === '') {
      setReasonMissing(true);
      return;
    }
    setReasonMissing(false);
    void act(action, reason.trim());
  };

  const resolved = report !== null && report.resolution.resolvedAt !== null;
  const stamp = (iso: string): string => new Date(iso).toLocaleString();

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <Link to="/admin/reports" className="mod-back">{t.moderation.backToQueue}</Link>
          <h1 className="profile__title">{t.moderation.detail.title}</h1>
        </header>

        {failure ? <p className="notice notice--warn" role="alert">{message}</p> : null}
        {loading ? <p className="profile__sub">{t.moderation.loading}</p> : null}

        {report ? (
          <div className="mod-detail">
            <section className="mod-card">
              <div className="mod-card__head">
                <h2 className="mod-card__title">
                  {isReason(report.reason) ? t.reports.reasons[report.reason] : report.reason}
                </h2>
                <StatusPill status={report.status} />
              </div>

              <dl className="mod-facts">
                <div className="mod-facts__row">
                  <dt>{t.moderation.columns.reporter}</dt>
                  <dd dir="auto">{report.reporter.name ?? t.moderation.unknownPerson}</dd>
                </div>
                <div className="mod-facts__row">
                  <dt>{t.moderation.columns.created}</dt>
                  <dd>{stamp(report.createdAt)}</dd>
                </div>
                {report.source ? (
                  <div className="mod-facts__row">
                    <dt>{t.moderation.detail.source}</dt>
                    <dd>{t.moderation.detail.sourcePublicProfile}</dd>
                  </div>
                ) : null}
              </dl>

              <h3 className="mod-card__sub">{t.moderation.detail.reporterExplanation}</h3>
              {/* The reporter wrote this, so it carries its own direction, not the page's. */}
              {report.note ? (
                <p className="mod-quote" dir="auto">{report.note}</p>
              ) : (
                <p className="mod-muted">
                  {report.noteRedacted ? t.moderation.detail.redacted : t.moderation.detail.noExplanation}
                </p>
              )}
            </section>

            <section className="mod-card">
              <h2 className="mod-card__title">{t.moderation.detail.subjectTitle}</h2>
              <dl className="mod-facts">
                <div className="mod-facts__row">
                  <dt>{t.moderation.columns.subject}</dt>
                  <dd dir="auto">{report.subjectAccount.name ?? t.moderation.unknownPerson}</dd>
                </div>
                {report.subjectAccount.email ? (
                  <div className="mod-facts__row">
                    <dt>{t.moderation.detail.subjectEmail}</dt>
                    <dd dir="ltr">{report.subjectAccount.email}</dd>
                  </div>
                ) : null}
                <div className="mod-facts__row">
                  <dt>{t.moderation.detail.subjectStatus}</dt>
                  <dd>
                    {report.subjectAccount.status && isAccountStatus(report.subjectAccount.status)
                      ? t.moderation.accountStatuses[report.subjectAccount.status]
                      : t.moderation.unknownPerson}
                  </dd>
                </div>
                <div className="mod-facts__row">
                  <dt>{t.moderation.detail.reportCount}</dt>
                  <dd>{report.subjectReportCount}</dd>
                </div>
              </dl>
              <p className="mod-muted">{t.moderation.detail.reportCountNote}</p>
            </section>

            <section className="mod-card">
              <h2 className="mod-card__title">{t.moderation.detail.historyTitle}</h2>
              <ol className="mod-history">
                {report.history.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="mod-history__item">
                    <p className="mod-history__action">
                      {isHistoryAction(entry.action) ? t.moderation.historyActions[entry.action] : entry.action}
                    </p>
                    <p className="mod-history__meta">
                      <span dir="auto">{entry.actor.name ?? t.moderation.unknownPerson}</span>
                      {' · '}
                      <time dateTime={entry.at}>{stamp(entry.at)}</time>
                    </p>
                    {entry.note ? <p className="mod-history__note" dir="auto">{entry.note}</p> : null}
                  </li>
                ))}
              </ol>
            </section>

            <section className="mod-card">
              <h2 className="mod-card__title">{t.moderation.resolve.title}</h2>

              <div className="mod-preview">
                <h3 className="mod-card__sub">{t.moderation.resolve.closurePreviewTitle}</h3>
                <p className="mod-quote">{t.moderation.resolve.closurePreview}</p>
                <p className="mod-muted">{t.moderation.resolve.closurePreviewNote}</p>
              </div>

              {resolved ? (
                <>
                  <p className="mod-resolved">{t.moderation.resolve.resolved}</p>
                  <dl className="mod-facts">
                    <div className="mod-facts__row">
                      <dt>{t.moderation.detail.resolvedBy}</dt>
                      <dd dir="auto">
                        {report.resolution.resolvedBy?.name ?? t.moderation.unknownPerson}
                      </dd>
                    </div>
                    <div className="mod-facts__row">
                      <dt>{t.moderation.detail.resolvedAt}</dt>
                      <dd>{stamp(report.resolution.resolvedAt ?? report.createdAt)}</dd>
                    </div>
                    {report.resolution.note ? (
                      <div className="mod-facts__row">
                        <dt>{t.moderation.detail.internalNote}</dt>
                        <dd dir="auto">{report.resolution.note}</dd>
                      </div>
                    ) : null}
                  </dl>
                </>
              ) : (
                <>
                  <div className="mod-field">
                    <label className="form-label" htmlFor="mod-note">
                      <span className="form-label__text">{t.moderation.resolve.noteLabel}</span>
                    </label>
                    <textarea
                      id="mod-note"
                      className="form-input"
                      dir="auto"
                      rows={3}
                      maxLength={2000}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                    <p className="mod-muted">{t.moderation.resolve.noteHint}</p>
                  </div>

                  <div className="mod-actions">
                    {report.status === 'open' ? (
                      <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void claim()}>
                        {t.moderation.resolve.claim}
                        {busy ? <ButtonSpinner /> : null}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy}
                      onClick={() => void resolve('dismissed', note.trim() || undefined)}
                    >
                      {t.moderation.resolve.dismiss}
                      {busy ? <ButtonSpinner /> : null}
                    </button>

                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={busy}
                      onClick={() => void resolve('actioned', note.trim() || undefined)}
                    >
                      {t.moderation.resolve.action}
                      {busy ? <ButtonSpinner /> : null}
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="mod-card">
              <h2 className="mod-card__title">{t.moderation.account.title}</h2>
              <p className="mod-card__lede">{t.moderation.account.lede}</p>

              <div className="mod-field">
                <label className="form-label" htmlFor="mod-reason">
                  <span className="form-label__text">{t.moderation.account.reasonLabel}</span>
                </label>
                <textarea
                  id="mod-reason"
                  className="form-input"
                  dir="auto"
                  rows={2}
                  maxLength={2000}
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                {reasonMissing ? (
                  <p className="mod-error" role="alert">{t.moderation.account.reasonRequired}</p>
                ) : null}
              </div>

              <div className="mod-actions">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busy || report.subjectAccount.status === 'restricted'}
                  onClick={() => runAccountAction('restrict')}
                >
                  {t.moderation.account.restrict}
                  {busy ? <ButtonSpinner /> : null}
                </button>

                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy || report.subjectAccount.status !== 'restricted'}
                  onClick={() => runAccountAction('unrestrict')}
                >
                  {t.moderation.account.unrestrict}
                  {busy ? <ButtonSpinner /> : null}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
};
