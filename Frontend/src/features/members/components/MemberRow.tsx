import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import { localeOf } from '../../../i18n/dateFormat';
import type { ProjectMember, ProjectMembers } from '../../../api/members.types';
import type { ProjectRole } from '../../../api/permissions.types';

const displayDate = (iso: string, lang: 'he' | 'en'): string =>
  new Date(iso).toLocaleDateString(localeOf(lang), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

export interface MemberRowProps {
  readonly member: ProjectMember;
  readonly viewer: ProjectMembers['viewer'];
  readonly allRoles: readonly ProjectRole[];
  readonly busy: boolean;
  readonly busyId: string | null;
  readonly onChangeRole: (membershipId: string, role: ProjectRole) => void;
  readonly onRemove: (membershipId: string) => void;
}

export const MemberRow = ({
  member, viewer, allRoles, busy, busyId, onChangeRole, onRemove,
}: MemberRowProps) => {
  const { t, lang } = useLanguage();

  const pending = member.status === 'invited';
  const mayRemove = pending
    ? viewer.canManageMembers || viewer.canInvite
    : viewer.canManageMembers;

  return (
    <li className="member-row">
      <div className="member-row__head">
        <span className="member-row__name" dir="auto">{member.name}</span>
        {member.isViewer ? <span className="perm-chip">{t.members.row.you}</span> : null}
        {member.fullAuthority ? (
          <span className="perm-chip perm-chip--full">{t.permissions.fullAuthority.granted}</span>
        ) : null}
      </div>

      <p className="member-row__meta">
        <span dir="auto">{member.companyName ?? t.members.row.noCompany}</span>
        {member.invitedByName ? (
          <span dir="auto">{t.members.row.invitedBy.replace('{name}', member.invitedByName)}</span>
        ) : null}
        {pending ? (
          <span>{t.members.row.invitedOn.replace('{date}', displayDate(member.invitedAt, lang))}</span>
        ) : null}
      </p>

      {viewer.canManageMembers ? (
        <label className="member-row__role">
          <span className="member-row__role-label">{t.members.row.role}</span>
          <select
            className="form-select form-select--inline"
            value={member.projectRole}
            disabled={busy}
            onChange={(event) => onChangeRole(member.id, event.target.value as ProjectRole)}
          >
            {allRoles.map((role) => (
              <option key={role} value={role}>{t.permissions.roles[role]}</option>
            ))}
          </select>
        </label>
      ) : (
        <p className="member-row__meta">
          <span>{`${t.members.row.role}: ${t.permissions.roles[member.projectRole]}`}</span>
        </p>
      )}

      {/* Authority is served as null to anyone who may not administer it, so there is nothing to say. */}
      {member.permissions === null ? (
        <p className="member-row__hint">{t.members.row.permissionsHidden}</p>
      ) : member.fullAuthority ? null : member.permissions.length === 0 ? (
        <p className="member-row__hint">{t.members.row.noPermissions}</p>
      ) : (
        <p className="member-row__perms" dir="auto">
          {member.permissions.map((permission) => t.permissions.perms[permission]).join(' · ')}
        </p>
      )}

      {/* Removing yourself is refused by the server, so the control is not offered. */}
      {mayRemove && !member.isViewer ? (
        <div className="member-row__actions">
          <button
            type="button"
            className="btn btn--quiet btn--sm"
            disabled={busy}
            onClick={() => onRemove(member.id)}
          >
            {pending ? t.members.row.withdraw : t.members.row.remove}
            {busyId === member.id ? <ButtonSpinner /> : null}
          </button>
        </div>
      ) : null}
    </li>
  );
};
