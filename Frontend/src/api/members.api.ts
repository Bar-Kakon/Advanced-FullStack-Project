import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody } from './types';
import type { ProjectRole } from './permissions.types';
import type {
  InvitePayload,
  ProjectInvitation,
  ProjectMember,
  ProjectMembers,
} from './members.types';

export const fetchProjectMembers = async (
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectMembers> => {
  const { data } = await api.get<ProjectMembers>(
    `/projects/${projectId}/members`,
    signal ? { signal } : {},
  );
  return data;
};

export const inviteMember = async (
  projectId: string,
  payload: InvitePayload,
): Promise<ProjectMember> => {
  const { data } = await api.post<{ member: ProjectMember }>(
    `/projects/${projectId}/members`,
    payload,
  );
  return data.member;
};

export const setMemberRole = async (
  projectId: string,
  membershipId: string,
  projectRole: ProjectRole,
): Promise<ProjectMember> => {
  const { data } = await api.patch<{ member: ProjectMember }>(
    `/projects/${projectId}/members/${membershipId}`,
    { projectRole },
  );
  return data.member;
};

export const removeMember = async (projectId: string, membershipId: string): Promise<void> => {
  await api.delete(`/projects/${projectId}/members/${membershipId}`);
};

export const fetchMyInvitations = async (
  signal?: AbortSignal,
): Promise<readonly ProjectInvitation[]> => {
  const { data } = await api.get<{ invitations: ProjectInvitation[] }>(
    '/project-invitations',
    signal ? { signal } : {},
  );
  return data.invitations;
};

export const acceptInvitation = async (membershipId: string): Promise<void> => {
  await api.post(`/project-invitations/${membershipId}/accept`);
};

export const declineInvitation = async (membershipId: string): Promise<void> => {
  await api.post(`/project-invitations/${membershipId}/decline`);
};

export type MembersFailure =
  | 'NOT_FOUND'
  | 'NOT_PERMITTED'
  | 'ALREADY_ON_PROJECT'
  | 'BLOCKED'
  | 'INVITATION_CLOSED'
  | 'OWN_AUTHORITY'
  | 'VALIDATION'
  | 'NETWORK'
  | 'UNKNOWN';

export const classifyMembersError = (error: unknown): MembersFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'PROJECT_NOT_FOUND':
    case 'MEMBERSHIP_NOT_FOUND':
    case 'PARTICIPANT_NOT_FOUND':
    case 'PERMISSION_TEMPLATE_NOT_FOUND':
      return 'NOT_FOUND';
    case 'COMPANY_PERMISSION_DENIED':
      return 'NOT_PERMITTED';
    case 'ALREADY_ON_PROJECT':
      return 'ALREADY_ON_PROJECT';
    case 'PARTICIPANT_BLOCKED':
      return 'BLOCKED';
    case 'INVITATION_NOT_OPEN':
      return 'INVITATION_CLOSED';
    case 'CANNOT_REMOVE_OWN_AUTHORITY':
      return 'OWN_AUTHORITY';
    case 'REQUEST_VALIDATION_FAILED':
      return 'VALIDATION';
    default:
      return 'UNKNOWN';
  }
};
