import { Link } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { FormAlert } from '../../components/FormAlert';
import { canManageEmployees } from '../../auth/destination';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { ProfileReminder } from './components/ProfileReminder';
import { StatGroup } from './components/StatGroup';
import { useDashboard } from './useDashboard';
import profileCss from '../profile/profile.css?inline';
import employeesCss from '../employees/employees.css?inline';
import dashboardCss from './dashboard.css?inline';

export const PersonalDashboardPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { dashboard, loading, failure, dismissing, reload, dismiss } = useDashboard();

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'employees.css', css: employeesCss },
    { id: 'dashboard.css', css: dashboardCss },
  );
  useDocumentTitle('לוח הבקרה האישי / Personal dashboard — FieldSync');

  const firstName = dashboard?.identity.firstName ?? user?.firstName ?? '';
  const lastName = dashboard?.identity.lastName ?? user?.lastName ?? '';
  const showManagement = user?.company?.standing !== 'employee' && canManageEmployees(user);

  const rating = dashboard?.reputation.rating ?? null;

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{t.dashboard.title}</h1>
            <p className="profile__sub">{t.dashboard.welcome.replace('{name}', firstName)}</p>
          </div>
        </header>

        {failure !== null ? (
          <section className="panel">
            <FormAlert
              message={failure === 'NETWORK' ? t.dashboard.errors.network : t.dashboard.errors.unknown}
            />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void reload()}>
              {t.dashboard.retry}
            </button>
          </section>
        ) : null}

        {loading && dashboard === null ? (
          <section className="panel">
            <p className="panel__lede" role="status">{t.dashboard.loading}</p>
          </section>
        ) : null}

        {dashboard !== null ? (
          <>
            <ProfileReminder
              reminder={dashboard.profileReminder}
              dismissing={dismissing}
              onDismiss={() => void dismiss()}
            />

            {dashboard.company !== null ? (
              <section className="panel" aria-labelledby="dashboard-company-title">
                <h2 id="dashboard-company-title" className="panel__title">{t.dashboard.company.title}</h2>

                <p className="company-line">
                  <span className="company-line__name">{dashboard.company.name}</span>
                  <span className="company-line__chip">
                    {t.dashboard.company.standing[dashboard.company.standing]}
                  </span>
                  <span className="company-line__chip">
                    {t.availability[dashboard.company.availability]}
                  </span>
                </p>
              </section>
            ) : null}

            <section className="panel" aria-labelledby="dashboard-network-title">
              <h2 id="dashboard-network-title" className="panel__title">{t.dashboard.network.title}</h2>
              <p className="panel__lede">{t.dashboard.network.lede}</p>

              <StatGroup
                stats={[
                  { key: 'connected', label: t.dashboard.network.connected, value: dashboard.network.connected },
                  { key: 'incoming', label: t.dashboard.network.incoming, value: dashboard.network.incoming },
                  { key: 'outgoing', label: t.dashboard.network.outgoing, value: dashboard.network.outgoing },
                  { key: 'blocked', label: t.dashboard.network.blocked, value: dashboard.network.blocked },
                ]}
              />

              <Link to="/browse" className="btn btn--ghost btn--sm">{t.dashboard.network.browse}</Link>
            </section>

            {dashboard.team !== null ? (
              <section className="panel" aria-labelledby="dashboard-team-title">
                <h2 id="dashboard-team-title" className="panel__title">{t.dashboard.team.title}</h2>
                <p className="panel__lede">{t.dashboard.team.lede}</p>

                <StatGroup
                  stats={[
                    { key: 'active', label: t.dashboard.team.active, value: dashboard.team.active },
                    { key: 'pending', label: t.dashboard.team.pendingApproval, value: dashboard.team.pendingApproval },
                    { key: 'invitations', label: t.dashboard.team.openInvitations, value: dashboard.team.openInvitations },
                  ]}
                />

                <Link to="/employees" className="btn btn--ghost btn--sm">{t.dashboard.team.manage}</Link>
              </section>
            ) : null}

            <section className="panel" aria-labelledby="dashboard-reputation-title">
              <h2 id="dashboard-reputation-title" className="panel__title">{t.dashboard.reputation.title}</h2>

              <div className="reputation">
                <div className="reputation__rating">
                  {rating === null ? (
                    <>
                      <span className="reputation__none">{t.dashboard.reputation.notRated}</span>
                      <span className="reputation__note">{t.dashboard.reputation.notRatedNote}</span>
                    </>
                  ) : (
                    <>
                      <span className="reputation__score">{rating.average.toFixed(1)}</span>
                      <span className="reputation__note">
                        {t.dashboard.reputation.ratingCount.replace('{count}', String(rating.count))}
                      </span>
                    </>
                  )}
                </div>

                <StatGroup
                  stats={[
                    {
                      key: 'completedWork',
                      label: t.dashboard.reputation.completedWork,
                      value: dashboard.reputation.completedWork,
                    },
                  ]}
                />
              </div>

              <Link to="/profile" className="btn btn--ghost btn--sm">{t.dashboard.reputation.viewProfile}</Link>
            </section>

            {showManagement ? (
              <section className="panel" aria-labelledby="management-title">
                <h2 id="management-title" className="panel__title">{t.dashboard.management.title}</h2>

                <ul className="tool-list">
                  <li className="tool-list__item">
                    <div className="tool-list__text">
                      <Link to="/employees" className="tool-list__name">
                        {t.dashboard.management.employees.name}
                      </Link>
                      <p className="tool-list__lede">{t.dashboard.management.employees.lede}</p>
                    </div>
                  </li>
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
};
