import { AppError } from '../../shared/errors.js';

/** The token identified nobody. Identity is proven per request, never assumed from a signature. */
export const profileNotFound = (): AppError =>
  new AppError('Profile not found', 404, 'PROFILE_NOT_FOUND');

/**
 * Company data is displayed on the profile and is not the profile's to change. A pending employee
 * meets this too: a valid Access Token proves identity, not active company authority.
 */
export const notPermittedToEditCompany = (): AppError =>
  new AppError('You are not permitted to edit this company', 403, 'COMPANY_PERMISSION_DENIED');

export const noActiveCompany = (): AppError =>
  new AppError('You do not belong to a company', 403, 'NO_ACTIVE_COMPANY');

/** The work entry named is not this caller's, or does not exist. One answer for both. */
export const workEntryNotFound = (): AppError =>
  new AppError('Work entry not found', 404, 'WORK_ENTRY_NOT_FOUND');

/** A linked entry named work the server cannot see, or cannot confirm belongs to this person. */
export const workLinkNotVerifiable = (): AppError =>
  new AppError('The referenced work could not be verified', 422, 'WORK_LINK_NOT_VERIFIABLE');
