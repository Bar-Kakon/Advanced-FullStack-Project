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
 * The surroundings only: navbar, heading and stylesheets. The feature is `EmployeeManagement`,
 * unchanged from the copy onboarding mounts, so skipping onboarding never loses it.
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
