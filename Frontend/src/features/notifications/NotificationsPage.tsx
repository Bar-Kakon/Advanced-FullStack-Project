import { Link } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { useNotifications } from './useNotifications';
import type { AppNotification } from '../../api/notifications.types';
import profileCss from '../profile/profile.css?inline';
import notificationsCss from './notifications.css?inline';

/**
 * The notification centre.
 *
 * One state per row: a row is unread until it carries a seen stamp. Reading it here is what
 * cancels the email that was queued behind it, so the control is a real action rather than a
 * display toggle.
 */
const destinationOf = (row: AppNotification): string | null => {
  if (row.proposalId !== null) return `/proposals/${row.proposalId}`;
  if (row.taskId !== null) return `/tasks/${row.taskId}`;
  if (row.scheduleExceptionId !== null && row.projectId !== null) {
    return `/projects/${row.projectId}/schedule-exceptions`;
  }
  if (row.projectId !== null) return `/projects/${row.projectId}`;
  return null;
};

export const NotificationsPage = () => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const {
    notifications, unreadOnly, setUnreadOnly, unreadCount, hasMore,
    loading, loadingMore, failure, loadMore, markSeen, markAllSeen,
  } = useNotifications();

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'notifications.css', css: notificationsCss },
  );
  useDocumentTitle(t.notifications.documentTitle);

  const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
  const formatter = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const contextOf = (row: AppNotification): string => {
    const parts = [row.payload.projectName, row.payload.taskTitle].filter(
      (value): value is string => value !== undefined && value.length > 0,
    );
    if (row.payload.fromDate !== undefined) {
      parts.push(
        row.payload.toDate !== undefined && row.payload.toDate !== row.payload.fromDate
          ? `${row.payload.fromDate} – ${row.payload.toDate}`
          : row.payload.fromDate,
      );
    }
    return parts.join(' · ');
  };

  return (
    <>
      <AppNav name={name} initials={initialsOf(user?.firstName ?? '', user?.lastName ?? '')} />

      <main className="profile-main">
        <header className="profile-header">
          <h1 className="profile-title">{t.notifications.title}</h1>
          <p className="profile-lede">{t.notifications.lede}</p>
        </header>

        {failure === null ? null : (
          <FormAlert message={failure === 'network' ? t.notifications.errors.network : t.notifications.errors.load} />
        )}

        <div className="notif-toolbar">
          <div className="notif-filter" role="group" aria-label={t.notifications.title}>
            <button
              type="button"
              className="notif-filter__option"
              aria-pressed={!unreadOnly}
              onClick={() => setUnreadOnly(false)}
            >
              {t.notifications.all}
            </button>
            <button
              type="button"
              className="notif-filter__option"
              aria-pressed={unreadOnly}
              onClick={() => setUnreadOnly(true)}
            >
              {t.notifications.unreadOnly}
            </button>
          </div>

          <span className="notif-chip" aria-label={t.notifications.unreadBadge}>
            {unreadCount}
          </span>

          <span className="notif-toolbar__spacer" />

          {unreadCount > 0 ? (
            <button type="button" className="btn btn--ghost" onClick={() => void markAllSeen()}>
              {t.notifications.markAllSeen}
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className="notif-empty">{t.notifications.loading}</p>
        ) : (notifications ?? []).length === 0 ? (
          <p className="notif-empty">
            {unreadOnly ? t.notifications.emptyUnread : t.notifications.empty}
          </p>
        ) : (
          <ul className="notif-list">
            {(notifications ?? []).map((row) => {
              const unread = row.seenAt === null;
              const destination = destinationOf(row);
              const context = contextOf(row);

              return (
                <li key={row.id} className={`notif-row${unread ? ' notif-row--unread' : ''}`}>
                  <div className="notif-row__body">
                    <h2 className="notif-row__title">{t.notifications.types[row.type]}</h2>
                    {context.length > 0 ? (
                      <p className="notif-row__context" dir="auto">{context}</p>
                    ) : null}

                    <div className="notif-row__meta">
                      <span
                        className={`notif-chip${row.notificationClass === 'blocking' ? ' notif-chip--blocking' : ''}`}
                      >
                        {row.notificationClass === 'blocking'
                          ? t.notifications.blocking
                          : t.notifications.nonblocking}
                      </span>
                      <span className="notif-row__time">
                        {formatter.format(new Date(row.createdAt))}
                      </span>
                    </div>

                    {row.muted ? <p className="notif-muted-note">{t.notifications.mutedNote}</p> : null}
                  </div>

                  <div className="notif-row__actions">
                    {destination === null ? null : (
                      <Link
                        to={destination}
                        className="btn btn--primary"
                        onClick={() => {
                          if (unread) void markSeen(row.id);
                        }}
                      >
                        {t.notifications.open}
                      </Link>
                    )}
                    {unread ? (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => void markSeen(row.id)}
                      >
                        {t.notifications.markSeen}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore ? (
          <div className="notif-more">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {t.notifications.loadMore}
              {loadingMore ? <ButtonSpinner /> : null}
            </button>
          </div>
        ) : null}
      </main>
    </>
  );
};
