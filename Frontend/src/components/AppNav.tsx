import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchUnreadCount } from '../api/notifications.api';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';
import { AccountMenu } from './AccountMenu';
import { LanguageSwitch } from './LanguageSwitch';

/**
 * The application navbar every authenticated screen carries.
 *
 * The static prototypes each held their own copy of this markup, and the source-of-truth document
 * records that the copies had already drifted three rules apart. This is the single component
 * those notes said the drift collapses into, so the fixes that had landed on only some copies —
 * the 800px link wrap and the logical chip padding — are simply what the component does.
 *
 * Three destinations have no screen yet. They keep their place in the approved navigation and are
 * disabled rather than linked, which is the same treatment Settings has in the account menu.
 */
export const AppNav = ({ name, initials }: { name: string; initials: string }) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  /**
   * Fetched once when a screen mounts. Real-time delivery is explicitly out of scope, and polling
   * would cost a request a second for a number that changes rarely — so the count is as fresh as
   * the screen the person just opened.
   */
  useEffect(() => {
    const controller = new AbortController();
    fetchUnreadCount(controller.signal)
      .then(setUnreadCount)
      .catch(() => {
        // A marker nobody can read is not worth an error state; the centre itself reports failure.
      });
    return () => controller.abort();
  }, []);

  // Hiding is a courtesy; the API refuses either way.
  const showEmployees =
    user?.company?.standing !== 'employee' &&
    (user?.company?.permissions.includes('company.invite_employees') ?? false);

  return (
    <header className="app-nav">
      <div className="app-nav__inner">
        <Link to="/dashboard" className="app-nav__brand" aria-label={t.nav.home}>
          <span className="app-nav__mark" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
              <circle cx="8" cy="20" r="6" fill="rgba(199,184,157,0.30)" stroke="rgba(255,253,248,0.92)" strokeWidth="2" />
              <circle cx="32" cy="8" r="6" fill="rgba(199,184,157,0.30)" stroke="rgba(255,253,248,0.92)" strokeWidth="2" />
              <circle cx="32" cy="32" r="6" fill="rgba(199,184,157,0.30)" stroke="rgba(255,253,248,0.92)" strokeWidth="2" />
              <line x1="14" y1="17" x2="26" y2="11" stroke="rgba(255,253,248,0.55)" strokeWidth="1.5" strokeDasharray="3 2" />
              <line x1="14" y1="23" x2="26" y2="29" stroke="rgba(255,253,248,0.55)" strokeWidth="1.5" strokeDasharray="3 2" />
              <line x1="32" y1="14" x2="32" y2="26" stroke="rgba(255,253,248,0.40)" strokeWidth="1.5" strokeDasharray="3 2" />
            </svg>
          </span>
          <span className="app-nav__name">FieldSync</span>
        </Link>

        <nav className="app-nav__links" aria-label={t.nav.label}>
          <Link to="/browse" className="app-nav__link">{t.nav.browse}</Link>
          <Link to="/network" className="app-nav__link">{t.nav.network}</Link>
          <Link to="/projects" className="app-nav__link">{t.nav.projects}</Link>
          <Link to="/tasks" className="app-nav__link">{t.nav.myTasks}</Link>
          {showEmployees ? (
            <Link to="/employees" className="app-nav__link">{t.nav.employees}</Link>
          ) : null}
          {/* Drawn only for platform moderators. Hiding it is a courtesy; the API refuses anyway. */}
          {user?.isAdmin === true ? (
            <Link to="/admin/reports" className="app-nav__link">{t.moderation.navLabel}</Link>
          ) : null}
        </nav>

        <div className="app-nav__actions">
          <Link to="/notifications" className="nav-icon-btn" aria-label={t.nav.notifications}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 ? (
              <span className="nav-badge" aria-label={t.notifications.unreadBadge}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </Link>

          <AccountMenu name={name} initials={initials} />

          <LanguageSwitch />
        </div>
      </div>
    </header>
  );
};
