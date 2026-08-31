import { useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import { PersonPicker } from '../../members/components/PersonPicker';
import type { ContractorSummary } from '../../../api/browse.types';
import type { DelegationScope, TaskDetail } from '../../../api/taskDetail.types';

export interface DelegationPanelProps {
  readonly task: TaskDetail;
  readonly busy: boolean;
  readonly onDelegate: (payload: { userId: string; scope: DelegationScope; partDescription?: string }) => void;
  readonly onEnd: () => void;
}

/**
 * Handing performance to somebody else, and ending it again.
 *
 * The panel exists only for the two parties to the arrangement. A delegate sees that they received
 * the work and is offered nothing — single-level delegation has no onward step, so there is no
 * control to disable.
 */
export const DelegationPanel = ({ task, busy, onDelegate, onEnd }: DelegationPanelProps) => {
  const { t } = useLanguage();
  const copy = t.tasks.detail.delegation;

  const [person, setPerson] = useState<ContractorSummary | null>(null);
  const [scope, setScope] = useState<DelegationScope>('whole');
  const [part, setPart] = useState('');

  const ready = person !== null && (scope === 'whole' || part.trim().length > 0);

  return (
    <section className="panel" aria-labelledby="delegation-title">
      <h2 id="delegation-title" className="panel__title">{copy.title}</h2>

      {task.viewerIsDelegate ? (
        <>
          <p className="panel__lede">{copy.receivedNote}</p>
          <p className="dash-note">{copy.noRedelegate}</p>
        </>
      ) : task.delegation !== null ? (
        <>
          <p className="panel__lede">
            {copy.performedBy.replace('{name}', task.delegation.delegateName ?? '')}
          </p>
          <p className="dash-note">
            {task.delegation.scope === 'part'
              ? `${copy.scopePart} — ${task.delegation.partDescription ?? ''}`
              : copy.scopeWhole}
          </p>
          {task.delegatorOnSiteRequired ? <p className="dash-note">{copy.onSite}</p> : null}
          {task.viewer.canEndDelegation ? (
            <>
              <p className="dash-note">{copy.endedNote}</p>
              <button type="button" className="btn btn--quiet btn--sm" disabled={busy} onClick={onEnd}>
                {copy.end}
                {busy ? <ButtonSpinner /> : null}
              </button>
            </>
          ) : null}
        </>
      ) : task.ownCrewOnly ? (
        <p className="panel__lede">{copy.ownCrewOnly}</p>
      ) : task.viewer.canDelegate ? (
        <>
          <p className="panel__lede">{copy.lede}</p>
          <PersonPicker value={person} onPick={setPerson} disabled={busy} />

          <div className="form-group">
            <label className="field-label" htmlFor="delegation-scope">{copy.scope.label}</label>
            <select
              id="delegation-scope"
              className="form-select"
              value={scope}
              onChange={(e) => setScope(e.target.value as DelegationScope)}
            >
              <option value="whole">{copy.scopeWhole}</option>
              <option value="part">{copy.scopePart}</option>
            </select>
          </div>

          {scope === 'part' ? (
            <div className="form-group">
              <label className="field-label" htmlFor="delegation-part">{copy.partLabel}</label>
              <input
                id="delegation-part"
                className="form-input"
                type="text"
                dir="auto"
                placeholder={copy.partPlaceholder}
                value={part}
                onChange={(e) => setPart(e.target.value)}
              />
            </div>
          ) : null}

          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={busy || !ready}
            onClick={() =>
              person &&
              onDelegate({
                userId: person.userId,
                scope,
                ...(scope === 'part' ? { partDescription: part.trim() } : {}),
              })
            }
          >
            {copy.send}
            {busy ? <ButtonSpinner /> : null}
          </button>
        </>
      ) : null}
    </section>
  );
};
