import { Link } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import profileCss from '../profile/profile.css?inline';

/**
 * The address a successful sign-in lands on, and no more than that.
 *
 * The approved flow is `Register → Login → Personal dashboard`, so Login needs somewhere to go;
 * approved screen #5 itself exists as a static prototype on an unmerged branch and has not been
 * migrated, so this states that plainly instead of standing in for it. It builds nothing of the
 * dashboard: eight widgets whose data has no endpoint would be a screen pretending to work.
 *
 * It borrows the profile stylesheet for the app shell rather than owning one, so nothing here has
 * to be unpicked when the real screen arrives — this file is deleted whole.
 */
export const PersonalDashboardPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  useScreenStylesheet({ id: 'profile.css', css: profileCss });
  useDocumentTitle('לוח הבקרה האישי / Personal dashboard — FieldSync');

  const firstName = user?.firstName ?? '';
  const fullName = `${firstName} ${user?.lastName ?? ''}`.trim();

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
      </main>
    </div>
  );
};
