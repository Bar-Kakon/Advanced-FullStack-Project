import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody } from './types';
import type {
  Grant,
  GrantPayload,
  PermissionTemplate,
  PermissionsOverview,
  ProjectPermission,
} from './permissions.types';

export const fetchPermissionsOverview = async (signal?: AbortSignal): Promise<PermissionsOverview> => {
  const { data } = await api.get<PermissionsOverview>('/permissions', signal ? { signal } : {});
  return data;
};

export const createGrant = async (payload: GrantPayload): Promise<Grant> => {
  const { data } = await api.post<{ grant: Grant }>('/permissions/grants', payload);
  return data.grant;
};

export const updateGrant = async (
  grantId: string,
  update: { permissions?: readonly ProjectPermission[]; fullAuthority?: boolean },
): Promise<Grant> => {
  const { data } = await api.patch<{ grant: Grant }>(`/permissions/grants/${grantId}`, update);
  return data.grant;
};

export const revokeGrant = async (grantId: string): Promise<void> => {
  await api.delete(`/permissions/grants/${grantId}`);
};

export const createTemplate = async (
  name: string,
  permissions: readonly ProjectPermission[],
  fullAuthority: boolean,
): Promise<PermissionTemplate> => {
  const { data } = await api.post<{ template: PermissionTemplate }>('/permissions/templates', {
    name,
    permissions,
    fullAuthority,
  });
  return data.template;
};

export const deleteTemplate = async (templateId: string): Promise<void> => {
  await api.delete(`/permissions/templates/${templateId}`);
};

export type PermissionsFailure =
  | 'NOT_PERMITTED'
  | 'NOT_FOUND'
  | 'NAME_TAKEN'
  | 'VALIDATION'
  | 'NETWORK'
  | 'UNKNOWN';

export const classifyPermissionsError = (error: unknown): PermissionsFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'COMPANY_PERMISSION_DENIED':
      return 'NOT_PERMITTED';
    case 'PROJECT_NOT_FOUND':
    case 'PERMISSION_TEMPLATE_NOT_FOUND':
      return 'NOT_FOUND';
    case 'PERMISSION_TEMPLATE_NAME_TAKEN':
      return 'NAME_TAKEN';
    case 'REQUEST_VALIDATION_FAILED':
      return 'VALIDATION';
    default:
      return 'UNKNOWN';
  }
};
