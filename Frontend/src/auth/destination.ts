import type { SessionUser } from '../api/types';

export const DASHBOARD = '/dashboard';
export const EMPLOYEE_ONBOARDING = '/onboarding/employees';
export const WAITING_FOR_APPROVAL = '/waiting-for-approval';

export const canManageEmployees = (user: SessionUser | null): boolean =>
  user?.company?.permissions.includes('company.invite_employees') ?? false;

export const isAwaitingApproval = (user: SessionUser | null): boolean =>
  user?.company?.membershipStatus === 'pending_company_approval';

/** The one place session state becomes an address, so Login and the guards cannot disagree. */
export const destinationFor = (user: SessionUser | null): string => {
  if (user === null) return '/login';

  const company = user.company;
  if (company === null) return DASHBOARD;
  if (company.membershipStatus === 'pending_company_approval') return WAITING_FOR_APPROVAL;
  if (!company.employeeSetupComplete && canManageEmployees(user)) return EMPLOYEE_ONBOARDING;

  return DASHBOARD;
};
