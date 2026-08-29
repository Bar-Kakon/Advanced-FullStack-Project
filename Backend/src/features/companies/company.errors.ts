import { AppError } from '../../shared/errors.js';

/**
 * The caller is authenticated but is not entitled to act on this company. 403 rather than 404:
 * this is a route about the caller's own company, so there is no resource whose existence a status
 * code could disclose.
 */
export const notPermittedToManageEmployees = (): AppError =>
  new AppError('You are not permitted to manage this company’s employees', 403, 'COMPANY_PERMISSION_DENIED');

/** The caller holds no active company relationship, so there is no company to act on. */
export const noActiveCompany = (): AppError =>
  new AppError('You do not belong to a company', 403, 'NO_ACTIVE_COMPANY');

/** The membership named does not exist in this company, or is not waiting for approval. */
export const nothingToApprove = (): AppError =>
  new AppError('No pending activation matched', 404, 'PENDING_ACTIVATION_NOT_FOUND');
