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

/**
 * The four employee-management calls, mirrored from `companies.module.ts`. Every path is one the
 * backend actually mounts, and nothing here loops one endpoint to imitate another.
 */
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

/**
 * Every waiting relationship at once. It is one request because the server answers one, and
 * approving twelve people from this screen must not be twelve chances for the eighth to fail.
 */
export const approveAllPendingEmployees = async (): Promise<number> => {
  const { data } = await api.post<ApprovalResponse>('/companies/employees/approve-all');
  return data.approved;
};

/**
 * The failures this feature renders individually, each naming a code the API raises on purpose.
 * The server's own `message` is English and unlocalised, so the screen answers the code and writes
 * its own sentence — putting that prose on a Hebrew screen would be a language bug on top of a
 * failure.
 *
 * `NOT_PERMITTED` and `NO_COMPANY` stay apart because they call for different sentences: one
 * person may be granted the capability, the other holds no company relationship at all.
 */
export type EmployeeFailure =
  | 'NOT_PERMITTED'
  | 'NO_COMPANY'
  | 'UNAUTHENTICATED'
  | 'NOTHING_TO_APPROVE'
  | 'VALIDATION'
  | 'NETWORK'
  | 'UNKNOWN';

/**
 * A request that never reached the server carries no `response` at all, so reading a code off one
 * would itself throw. That check comes first: telling somebody they are not permitted to manage
 * employees when the API is simply not running is the mistake the ordering exists to prevent.
 */
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
    // Somebody else approved this person between the list being drawn and the button being
    // pressed. The screen is stale, which is not the same thing as the action having failed.
    case 'PENDING_ACTIVATION_NOT_FOUND':
      return 'NOTHING_TO_APPROVE';
    case 'REQUEST_VALIDATION_FAILED':
      return 'VALIDATION';
    default:
      return 'UNKNOWN';
  }
};
