import { useState } from 'react';

import { useLanguage } from '../../i18n/useLanguage';
import { DepartureDefaultsPanel } from './components/DepartureDefaultsPanel';
import { DepartureWorkbench, type WorkbenchTarget } from './components/DepartureWorkbench';
import { EmployeeList } from './components/EmployeeList';
import { InviteEmployeeForm } from './components/InviteEmployeeForm';
import { useEmployeeManagement } from './useEmployeeManagement';

/**
 * The feature with no surroundings, mounted by both onboarding and the ordinary screen. Whether
 * the caller may be here is not decided here: the request is made, and the server's 403 closes it.
 */
export const EmployeeManagement = () => {
  const { t } = useLanguage();
  const state = useEmployeeManagement();
  const [workbench, setWorkbench] = useState<
    { target: WorkbenchTarget; mode: 'offboard' | 'manage' } | null
  >(null);

  const activeEmployees = state.employees
    .filter((row) => row.status === 'active' && row.standing === 'employee' && row.userId !== null)
    .map((row) => ({ userId: row.userId as string, name: row.invitedFullName ?? '' }));

  const blockedMessage =
    state.listFailure === 'NOT_PERMITTED' ? t.employees.errors.notPermitted
    : state.listFailure === 'NO_COMPANY' ? t.employees.errors.noCompany
    : state.listFailure === 'UNAUTHENTICATED' ? t.employees.errors.unauthenticated
    : null;

  // No form and no list: an empty list would read as a company with no staff, not a closed door.
  if (blockedMessage) {
    return (
      <section className="panel" aria-labelledby="employee-blocked-title">
        <h2 id="employee-blocked-title" className="panel__title">{t.employees.title}</h2>
        <p className="notice notice--error" role="alert">{blockedMessage}</p>
      </section>
    );
  }

  if (workbench !== null) {
    return (
      <DepartureWorkbench
        target={workbench.target}
        employees={activeEmployees}
        mode={workbench.mode}
        onClose={() => setWorkbench(null)}
        onDone={() => {
          setWorkbench(null);
          state.refresh();
        }}
      />
    );
  }

  return (
    <>
      <InviteEmployeeForm state={state} />
      <EmployeeList
        state={state}
        onOffboard={(row) =>
          setWorkbench({
            target: {
              userId: row.userId as string,
              name: row.invitedFullName ?? '',
              membershipId: row.id,
            },
            mode: 'offboard',
          })
        }
        onManageDeparture={(row) =>
          setWorkbench({
            target: { userId: row.userId as string, name: row.invitedFullName ?? '' },
            mode: 'manage',
          })
        }
      />
      {state.canManagePermissions ? <DepartureDefaultsPanel employees={activeEmployees} /> : null}
    </>
  );
};
