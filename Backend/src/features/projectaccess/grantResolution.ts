import { Types } from 'mongoose';

import { templateNotFound } from './permissions.errors.js';
import type { PermissionTemplateRepository } from './permissionTemplate.repository.js';
import type { ProjectGrantRepository } from './projectGrant.repository.js';
import type { ProjectPermission } from './projectPermission.js';

/**
 * The one place a set of project permissions is worked out from what a caller asked for.
 *
 * A grant comes from exactly one source. A template and a copied grant are both read HERE and now,
 * so editing either afterwards never reaches back into a row this produced.
 */
export interface GrantSource {
  readonly permissions?: readonly ProjectPermission[];
  readonly fullAuthority?: boolean;
  readonly templateId?: string;
  readonly copyFromGrantId?: string;
}

export interface ResolvedGrant {
  readonly permissions: readonly ProjectPermission[];
  readonly fullAuthority: boolean;
}

export interface GrantResolutionContext {
  readonly companyId: string;
  readonly projectId: Types.ObjectId;
  readonly templates: PermissionTemplateRepository;
  readonly grants: ProjectGrantRepository;
}

export const resolveGrantSource = async (
  source: GrantSource,
  { companyId, projectId, templates, grants }: GrantResolutionContext,
): Promise<ResolvedGrant> => {
  if (source.templateId !== undefined) {
    const template = await templates.findOwnedById(source.templateId, new Types.ObjectId(companyId));
    if (template === null) throw templateNotFound();
    return { permissions: template.permissions, fullAuthority: template.fullAuthority };
  }

  if (source.copyFromGrantId !== undefined) {
    const from = await grants.findById(source.copyFromGrantId);
    // Copying across projects would carry authority between jobs that stand on their own.
    if (from === null || from.project.toString() !== projectId.toString()) throw templateNotFound();
    return { permissions: from.permissions, fullAuthority: from.fullAuthority };
  }

  return { permissions: source.permissions ?? [], fullAuthority: source.fullAuthority ?? false };
};
