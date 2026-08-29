import { useLanguage } from '../../i18n/useLanguage';
import { EmployeeList } from './components/EmployeeList';
import { InviteEmployeeForm } from './components/InviteEmployeeForm';
import { useEmployeeManagement } from './useEmployeeManagement';

/**
 * Employee management itself, with no surroundings at all: no navbar, no page heading and no
 * onward navigation. It is mounted twice — once inside first-time owner onboarding and once as an
 * ordinary authenticated screen — and it is one component because it is one feature. The list, the
 * invitation form, the statuses, the approvals, the loading and error states and the strings are
 * therefore identical in both places by construction rather than by review.
 *
 * Whether the caller may be here at all is not decided in this file. Nothing reads a standing or a
 * job title to unlock a control: the request is made, and the server's own 403 is what closes the
 * screen. The backend is the security boundary, and this only stops drawing controls the server
 * has already said it will refuse.
 */
export const EmployeeManagement = () => {
  const { t } = useLanguage();
  const state = useEmployeeManagement();

  const blockedMessage =
    state.listFailure === 'NOT_PERMITTED' ? t.employees.errors.notPermitted
    : state.listFailure === 'NO_COMPANY' ? t.employees.errors.noCompany
    : state.listFailure === 'UNAUTHENTICATED' ? t.employees.errors.unauthenticated
    : null;

  /*
   * One panel and nothing else. A person the server will not let manage employees is not shown an
   * invitation form that cannot succeed, and is not shown an empty list that would read as a
   * company with no staff rather than as a door that is closed to them.
   */
  if (blockedMessage) {
    return (
      <section className="panel" aria-labelledby="employee-blocked-title">
        <h2 id="employee-blocked-title" className="panel__title">{t.employees.title}</h2>
        <p className="notice notice--error" role="alert">{blockedMessage}</p>
      </section>
    );
  }

  return (
    <>
      <InviteEmployeeForm state={state} />
      <EmployeeList state={state} />
    </>
  );
};
