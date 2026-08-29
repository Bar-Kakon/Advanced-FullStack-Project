import { Link } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { canManageEmployees } from '../../auth/destination';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import profileCss from '../profile/profile.css?inline';
import employeesCss from '../employees/employees.css?inline';

/**
 * The address a successful sign-in lands on, and no more than that.
 *
 * The approved flow is `Register → Login → Personal dashboard`, so Login needs somewhere to go;
 * approved screen #5 itself exists as a static prototype on an unmerged branch and has not been
 * migrated, so this states that plainly instead of standing in for it. It builds nothing of the
 * dashboard: eight widgets whose data has no endpoint would be a screen pretending to work.
 *
 * The Management section is the exception, because the tool it lists is built. It is a list of
 * one, and it is drawn as a list so a second real tool is one entry rather than a redesign.
 */
export const PersonalDashboardPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'employees.css', css: employeesCss },
  );
  useDocumentTitle('לוח הבקרה האישי / Personal dashboard — FieldSync');

  const firstName = user?.firstName ?? '';
  const fullName = `${firstName} ${user?.lastName ?? ''}`.trim();

  // An empty Management section is worse than none.
  const showManagement = user?.company?.standing !== 'employee' && canManageEmployees(user);

  return (
    <div className="app">
      <AppNav name={fullName} initials={initialsOf(firstName, user?.lastName ?? '')} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{t.dashboard.title}</h1>
            <p className="profile__sub">{t.dashboard.welcome.replace('{name}', firstName)}</p>
          </div>
        </header>

        <section className="panel">
          <p className="panel__lede">{t.dashboard.notMigrated}</p>
          <Link to="/profile" className="btn btn--ghost btn--sm">{t.profile.title}</Link>
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
      </main>
    </div>
  );
};
