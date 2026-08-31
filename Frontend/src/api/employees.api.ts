import { isAxiosError } from 'axios';

import { api } from './client';
import type {
  ApiErrorBody,
  ApprovalResponse,
  CreateInvitationPayload,
  CreateInvitationResponse,
  EmployeeListResponse,
  EmployeeMembership,
} from './types';

/** Mirrored from `companies.module.ts`. Nothing here loops one endpoint to imitate another. */
export const listEmployees = async (): Promise<readonly EmployeeMembership[]> => {
  const { data } = await api.get<EmployeeListResponse>('/companies/employees');
  return data.memberships;
};

/** Opens a seat. The 201 names the row, and the caller re-reads the list rather than trusting it. */
export const inviteEmployee = async (
  payload: CreateInvitationPayload,
): Promise<CreateInvitationResponse> => {
  const { data } = await api.post<CreateInvitationResponse>('/companies/employees/invitations', payload);
  return data;
};

/** One waiting relationship becomes `active`. Answers how many rows moved, which is always 1 here. */
export const approveEmployee = async (membershipId: string): Promise<number> => {
  const { data } = await api.post<ApprovalResponse>(`/companies/employees/${membershipId}/approve`);
  return data.approved;
};

/** One request, because the server answers one. Twelve calls would be twelve chances to fail. */
export const approveAllPendingEmployees = async (): Promise<number> => {
  const { data } = await api.post<ApprovalResponse>('/companies/employees/approve-all');
  return data.approved;
};

/** Withdraws a seat nobody has claimed. The list is re-read afterwards, never patched locally. */
export const cancelInvitation = async (membershipId: string): Promise<void> => {
  await api.delete(`/companies/employees/invitations/${membershipId}`);
};

/** Skip and Finish record the same fact, so both end here. Idempotent. */
export const completeEmployeeSetup = async (): Promise<void> => {
  await api.post('/companies/employee-setup/complete');
};

/**
 * The failures this feature renders individually. The screen answers the code and writes its own
 * sentence, because the server's `message` is English and unlocalised.
 */
export type EmployeeFailure =
  | 'NOT_PERMITTED'
  | 'NO_COMPANY'
  | 'UNAUTHENTICATED'
  | 'NOTHING_TO_APPROVE'
  | 'NOTHING_TO_CANCEL'
  | 'MAIN_CONTRACTOR_TAKEN'
  | 'VALIDATION'
  | 'NETWORK'
  | 'UNKNOWN';

/** The no-response check comes first: an unreachable API must not read as "not permitted". */
export const classifyEmployeeError = (error: unknown): EmployeeFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'COMPANY_PERMISSION_DENIED':
      return 'NOT_PERMITTED';
    case 'NO_ACTIVE_COMPANY':
      return 'NO_COMPANY';
    case 'UNAUTHENTICATED':
      return 'UNAUTHENTICATED';
    // Somebody else approved them first: the screen is stale, the action did not fail.
    case 'PENDING_ACTIVATION_NOT_FOUND':
      return 'NOTHING_TO_APPROVE';
    // Somebody else withdrew it first: the screen is stale, the action did not fail.
    case 'PENDING_INVITATION_NOT_FOUND':
      return 'NOTHING_TO_CANCEL';
    case 'MAIN_CONTRACTOR_SEAT_TAKEN':
      return 'MAIN_CONTRACTOR_TAKEN';
    case 'REQUEST_VALIDATION_FAILED':
      return 'VALIDATION';
    default:
      return 'UNKNOWN';
  }
};
