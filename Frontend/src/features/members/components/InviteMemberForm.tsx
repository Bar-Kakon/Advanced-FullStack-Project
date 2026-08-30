import { useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { SelectField } from '../../../components/SelectField';
import { useLanguage } from '../../../i18n/useLanguage';
import { FullAuthorityDialog } from '../../permissions/components/FullAuthorityDialog';
import { PersonPicker } from './PersonPicker';
import type { ContractorSummary } from '../../../api/browse.types';
import type { InvitePayload, ProjectMembers } from '../../../api/members.types';
import type { PermissionTemplate, ProjectPermission, ProjectRole } from '../../../api/permissions.types';

/** One invitation carries authority from exactly one of these, which is what the API accepts. */
const AUTHORITY_MODES = ['none', 'selected', 'template', 'copy', 'full'] as const;
type AuthorityMode = (typeof AUTHORITY_MODES)[number];

export interface InviteMemberFormProps {
  readonly data: ProjectMembers;
  readonly templates: readonly PermissionTemplate[];
  readonly busy: boolean;
  readonly onInvite: (payload: InvitePayload) => Promise<boolean>;
}

export const InviteMemberForm = ({ data, templates, busy, onInvite }: InviteMemberFormProps) => {
  const { t } = useLanguage();

  const [person, setPerson] = useState<ContractorSummary | null>(null);
  const [role, setRole] = useState<ProjectRole | ''>('');
  const [mode, setMode] = useState<AuthorityMode>('none');
  const [permissions, setPermissions] = useState<readonly ProjectPermission[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [copyFromGrantId, setCopyFromGrantId] = useState('');
  const [confirming, setConfirming] = useState(false);

  const copySources = data.members.filter((member) => !member.isViewer);

  const reset = () => {
    setPerson(null);
    setRole('');
    setMode('none');
    setPermissions([]);
    setTemplateId('');
    setCopyFromGrantId('');
  };

  const payload = (): InvitePayload | null => {
    if (person === null || role === '') return null;
    const base = { userId: person.userId, projectRole: role };

    switch (mode) {
      case 'selected':
        return permissions.length === 0 ? base : { ...base, permissions };
      case 'template':
        return templateId === '' ? null : { ...base, templateId };
      case 'copy':
        return copyFromGrantId === '' ? null : { ...base, copyFromGrantId };
      case 'full':
        return { ...base, fullAuthority: true };
      default:
        return base;
    }
  };

  const send = async () => {
    const body = payload();
    if (body === null) return;
    if (await onInvite(body)) reset();
  };

  const ready = payload() !== null;

  const togglePermission = (permission: ProjectPermission) =>
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission],
    );

  return (
    <section className="panel" aria-labelledby="invite-title">
      <h2 id="invite-title" className="panel__title">{t.members.invite.title}</h2>
      <p className="panel__lede">{t.members.invite.lede}</p>

      <PersonPicker value={person} onPick={setPerson} disabled={busy} />

      <SelectField
        id="projectRole"
        label={t.members.invite.role.label}
        placeholder={t.members.invite.role.placeholder}
        value={role}
        onChange={setRole}
        options={data.allRoles.map((value) => ({ value, label: t.permissions.roles[value] }))}
      />

      {/* Handing out authority is a second right. Somebody who may only invite never sees this. */}
      {data.viewer.canGrantPermissions ? (
        <div className="member-authority">
          <h3 className="member-authority__title">{t.members.authority.title}</h3>
          <p className="panel__lede">{t.members.authority.lede}</p>

          <ul className="member-authority__modes">
            {AUTHORITY_MODES.map((option) => (
              <li key={option}>
                <label className="perm-check">
                  <input
                    type="radio"
                    name="authorityMode"
                    checked={mode === option}
                    disabled={busy}
                    onChange={() => {
                      if (option === 'full') {
                        setConfirming(true);
                        return;
                      }
                      setMode(option);
                    }}
                  />
                  <span>{t.members.authority[option]}</span>
                </label>
              </li>
            ))}
          </ul>

          {mode === 'selected' ? (
            <ul className="perm-checks">
              {data.allPermissions.map((permission) => (
                <li key={permission}>
                  <label className="perm-check">
                    <input
                      type="checkbox"
                      checked={permissions.includes(permission)}
                      disabled={busy}
                      onChange={() => togglePermission(permission)}
                    />
                    <span>{t.permissions.perms[permission]}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}

          {mode === 'template' ? (
            templates.length === 0 ? (
              <p className="field-hint">{t.members.authority.noTemplates}</p>
            ) : (
              <SelectField
                id="templateId"
                label={t.members.authority.template}
                placeholder={t.members.authority.templatePlaceholder}
                value={templateId}
                onChange={(next) => setTemplateId(next)}
                options={templates.map((template) => ({ value: template.id, label: template.name }))}
              />
            )
          ) : null}

          {mode === 'copy' ? (
            copySources.length === 0 ? (
              <p className="field-hint">{t.members.authority.noCopySource}</p>
            ) : (
              <SelectField
                id="copyFromGrantId"
                label={t.members.authority.copy}
                placeholder={t.members.authority.copyPlaceholder}
                value={copyFromGrantId}
                onChange={(next) => setCopyFromGrantId(next)}
                options={copySources.map((member) => ({ value: member.id, label: member.name }))}
              />
            )
          ) : null}

          {confirming ? (
            <FullAuthorityDialog
              busy={busy}
              onConfirm={() => {
                setConfirming(false);
                setMode('full');
              }}
              onDismiss={() => setConfirming(false)}
            />
          ) : null}
        </div>
      ) : null}

      <div className="member-invite__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={busy || !ready}
          onClick={() => void send()}
        >
          {t.members.invite.send}
          {busy ? <ButtonSpinner /> : null}
        </button>
      </div>
    </section>
  );
};
