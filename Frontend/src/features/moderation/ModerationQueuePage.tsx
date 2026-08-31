import { Link } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { StatusPill } from './components/StatusPill';
import { useModerationQueue } from './useModerationQueue';
import { REPORT_REASONS, type ReportReason } from '../../api/reports.types';
import type { ModerationReportStatus } from '../../api/moderation.types';
import profileCss from '../profile/profile.css?inline';
import moderationCss from './moderation.css?inline';

const STATUSES: readonly ModerationReportStatus[] = ['open', 'under_review', 'dismissed', 'actioned'];

const isReason = (value: string): value is ReportReason =>
  (REPORT_REASONS as readonly string[]).includes(value);

/**
 * The moderation queue. It is a work list, not a dashboard: no counts, no charts and no metric
 * tiles — the only thing on it is the reports waiting to be read, newest first.
 */
export const ModerationQueuePage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { status, setStatus, reports, loading, failure } = useModerationQueue();

  useScreenStylesheet({ id: 'profile.css', css: profileCss }, { id: 'moderation.css', css: moderationCss });
  useDocumentTitle(t.moderation.documentTitle);

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';

  const dateOf = (iso: string): string => new Date(iso).toLocaleDateString();

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <h1 className="profile__title">{t.moderation.queueTitle}</h1>
          <p className="profile__sub">{t.moderation.queueLede}</p>
        </header>

        <div className="mod-filter">
          <label className="form-label" htmlFor="mod-status">
            <span className="form-label__text">{t.moderation.filterLabel}</span>
          </label>
          <select
            id="mod-status"
            className="form-input mod-filter__select"
            value={status}
            onChange={(event) => setStatus(event.target.value as ModerationReportStatus | '')}
          >
            <option value="">{t.moderation.filterAll}</option>
            {STATUSES.map((code) => (
              <option key={code} value={code}>{t.moderation.statuses[code]}</option>
            ))}
          </select>
        </div>

        {failure ? <p className="notice notice--warn" role="alert">{t.moderation.errors.unknown}</p> : null}
        {loading ? <p className="profile__sub">{t.moderation.loading}</p> : null}

        {!loading && reports.length === 0 ? (
          <p className="mod-empty">{t.moderation.empty}</p>
        ) : null}

        {reports.length > 0 ? (
          <ul className="mod-queue">
            {reports.map((report) => (
              <li key={report.id} className="mod-row">
                <div className="mod-row__main">
                  <p className="mod-row__reason">
                    {isReason(report.reason) ? t.reports.reasons[report.reason] : report.reason}
                  </p>
                  <p className="mod-row__people">
                    <span className="mod-row__term">{t.moderation.columns.subject}:</span>{' '}
                    <span dir="auto">{report.subject.name ?? t.moderation.unknownPerson}</span>
                    {' · '}
                    <span className="mod-row__term">{t.moderation.columns.reporter}:</span>{' '}
                    <span dir="auto">{report.reporter.name ?? t.moderation.unknownPerson}</span>
                  </p>
                </div>

                <div className="mod-row__side">
                  <StatusPill status={report.status} />
                  <time className="mod-row__date" dateTime={report.createdAt}>
                    {dateOf(report.createdAt)}
                  </time>
                  <Link to={`/admin/reports/${report.id}`} className="btn btn--ghost btn--sm">
                    {t.moderation.openDetail}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
};