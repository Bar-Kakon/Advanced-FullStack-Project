import { AppNav } from '../../components/AppNav';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { EmployeeManagement } from './EmployeeManagement';
import profileCss from '../profile/profile.css?inline';
import editProfileCss from '../profile/edit-profile.css?inline';
import employeesCss from './employees.css?inline';

/**
 * Employee management reached the ordinary way, from inside the authenticated application.
 *
 * This file is the *surroundings* and nothing else: the navbar, the page heading and the screen's
 * stylesheets. The feature itself is `EmployeeManagement`, unchanged from the copy first-time
 * onboarding mounts — which is what keeps skipping onboarding from ever meaning the owner has lost
 * the feature. They come back here and invite somebody whenever they like.
 *
 * Three sheets, in the order the cascade needs them: the app shell, then the form fields the shell
 * does not draw, then the list and the two controls neither of them has.
 */
export const EmployeeManagementPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'edit-profile.css', css: editProfileCss },
    { id: 'employees.css', css: employeesCss },
  );
  useDocumentTitle('ניהול עובדים / Employee management — FieldSync');

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{t.employees.title}</h1>
            <p className="profile__sub">{t.employees.lede}</p>
          </div>
        </header>

        <EmployeeManagement />
      </main>
    </div>
  );
};
