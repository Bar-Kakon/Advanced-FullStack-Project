import { useEffect, useMemo, useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import {
  applyDepartureArrangements,
  fetchDepartureWork,
  offboardEmployee,
} from '../../../api/employees.api';
import type {
  AssignedArrangement,
  CommissionArrangement,
  DepartureWork,
  DepartureWorkItem,
} from '../../../api/types';

export interface WorkbenchTarget {
  readonly userId: string;
  readonly name: string;
  /** Present only in the offboard mode; the manage mode arranges without removing anybody. */
  readonly membershipId?: string;
}

export interface EmployeeOption {
  readonly userId: string;
  readonly name: string;
}

type CommissionChoice = { arrangement: 'owner_only' | 'transferred' | 'shared'; trackee?: string };
type AssignedChoice = { action: 'transfer' | 'await_reassignment'; assignee?: string };

/**
 * The owner's departure workbench: one member's unsettled commissions and duties, chosen per item
 * or in bulk, summarised, then applied in one all-or-nothing call. In offboard mode the same
 * confirmation also ends the employment.
 */
export const DepartureWorkbench = ({
  target,
  employees,
  mode,
  onClose,
  onDone,
}: {
  target: WorkbenchTarget;
  employees: readonly EmployeeOption[];
  mode: 'offboard' | 'manage';
  onClose: () => void;
  onDone: () => void;
}) => {
  const { t } = useLanguage();
  const copy = t.employees.departure;

  const [work, setWork] = useState<DepartureWork | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [commissionChoices, setCommissionChoices] = useState<ReadonlyMap<string, CommissionChoice>>(new Map());
  const [assignedChoices, setAssignedChoices] = useState<ReadonlyMap<string, AssignedChoice>>(new Map());
  const [bulkTrackee, setBulkTrackee] = useState('');

  useEffect(() => {
    let current = true;
    fetchDepartureWork(target.userId)
      .then((result) => {
        if (current) setWork(result);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [target.userId]);

  const others = employees.filter((person) => person.userId !== target.userId);
  const allIds = useMemo(
    () => (work === null ? [] : [...work.commissions, ...work.assigned].map((item) => item.id)),
    [work],
  );
  const commissionIds = useMemo(
    () => new Set((work?.commissions ?? []).map((item) => item.id)),
    [work],
  );

  const toggle = (id: string, on: boolean): void => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const applyBulk = (kind: 'owner_only' | 'transferred' | 'shared' | 'transfer' | 'await_reassignment'): void => {
    const trackee = bulkTrackee || undefined;
    setCommissionChoices((previous) => {
      const next = new Map(previous);
      for (const id of selected) {
        if (!commissionIds.has(id)) continue;
        if (kind === 'owner_only') next.set(id, { arrangement: 'owner_only' });
        else if (kind === 'transferred' || kind === 'shared') {
          if (trackee !== undefined) next.set(id, { arrangement: kind, trackee });
        }
      }
      return next;
    });
    setAssignedChoices((previous) => {
      const next = new Map(previous);
      for (const id of selected) {
        if (commissionIds.has(id)) continue;
        if (kind === 'await_reassignment') next.set(id, { action: 'await_reassignment' });
        else if (kind === 'transfer' && trackee !== undefined) {
          next.set(id, { action: 'transfer', assignee: trackee });
        }
      }
      return next;
    });
  };

  const summary = useMemo(() => {
    const counts = { ownerOnly: 0, transferred: 0, shared: 0, moved: 0, awaiting: 0, unset: 0 };
    for (const item of work?.commissions ?? []) {
      const choice = commissionChoices.get(item.id);
      if (choice === undefined) counts.unset += 1;
      else if (choice.arrangement === 'owner_only') counts.ownerOnly += 1;
      else if (choice.arrangement === 'transferred') counts.transferred += 1;
      else counts.shared += 1;
    }
    for (const item of work?.assigned ?? []) {
      const choice = assignedChoices.get(item.id);
      if (choice === undefined) counts.unset += 1;
      else if (choice.action === 'transfer') counts.moved += 1;
      else counts.awaiting += 1;
    }
    return counts;
  }, [work, commissionChoices, assignedChoices]);

  const confirm = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const arrangements = {
      commissions: [...commissionChoices.entries()].map(([taskId, choice]): CommissionArrangement => ({
        taskId,
        arrangement: choice.arrangement,
        ...(choice.trackee === undefined ? {} : { trackeeUserId: choice.trackee }),
      })),
      assigned: [...assignedChoices.entries()].map(([taskId, choice]): AssignedArrangement => ({
        taskId,
        action: choice.action,
        ...(choice.assignee === undefined ? {} : { assigneeUserId: choice.assignee }),
      })),
    };
    try {
      if (mode === 'offboard' && target.membershipId !== undefined) {
        await offboardEmployee(target.membershipId, arrangements);
      } else {
        await applyDepartureArrangements(target.userId, arrangements);
      }
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const nameOfChoice = (id: string): string | null => {
    const commission = commissionChoices.get(id);
    if (commission !== undefined) {
      const who = others.find((person) => person.userId === commission.trackee)?.name;
      if (commission.arrangement === 'owner_only') return copy.choiceOwnerOnly;
      if (commission.arrangement === 'transferred') return `${copy.choiceTransferred}: ${who ?? ''}`;
      return `${copy.choiceShared}: ${who ?? ''}`;
    }
    const assigned = assignedChoices.get(id);
    if (assigned !== undefined) {
      if (assigned.action === 'await_reassignment') return copy.choiceAwaiting;
      const who = others.find((person) => person.userId === assigned.assignee)?.name;
      return `${copy.choiceMoved}: ${who ?? ''}`;
    }
    return null;
  };

  const renderItem = (item: DepartureWorkItem) => (
    <li key={item.id} className="task-row">
      <label className="departure-item">
        <input
          type="checkbox"
          checked={selected.has(item.id)}
          onChange={(event) => toggle(item.id, event.target.checked)}
        />
        <span className="departure-item__text">
          <span dir="auto" className="departure-item__title">{item.title}</span>
          <span className="departure-item__meta">
            {item.projectName !== null ? <span dir="auto">{item.projectName}</span> : null}
            {item.performer !== null ? (
              <span dir="auto">{copy.performer.replace('{name}', item.performer.name)}</span>
            ) : null}
            <span>{t.tasks.row.due.replace('{date}', item.dueDate)}</span>
            {item.awaitingReassignment ? <span>{copy.awaitingBadge}</span> : null}
          </span>
          {nameOfChoice(item.id) !== null ? (
            <span className="departure-item__choice">{nameOfChoice(item.id)}</span>
          ) : null}
        </span>
      </label>
    </li>
  );

  return (
    <section className="panel" aria-labelledby="departure-title">
      <h2 id="departure-title" className="panel__title">
        {(mode === 'offboard' ? copy.titleOffboard : copy.titleManage).replace('{name}', target.name)}
      </h2>
      <p className="panel__lede">{copy.lede}</p>

      {failed ? <p className="notice notice--error" role="alert">{copy.failed}</p> : null}
      {work === null && !failed ? <p className="panel__lede">{copy.loading}</p> : null}

      {work !== null ? (
        <>
          {allIds.length === 0 ? (
            <p className="panel__lede">{copy.empty}</p>
          ) : (
            <>
              <div className="departure-bulk">
                <button
                  type="button"
                  className="btn btn--quiet btn--sm"
                  onClick={() =>
                    setSelected(selected.size === allIds.length ? new Set() : new Set(allIds))
                  }
                >
                  {selected.size === allIds.length ? copy.selectNone : copy.selectAll}
                </button>
                <span className="departure-bulk__count">
                  {copy.selectedCount.replace('{count}', String(selected.size))}
                </span>

                <select
                  className="form-input departure-bulk__select"
                  value={bulkTrackee}
                  onChange={(event) => setBulkTrackee(event.target.value)}
                >
                  <option value="">{copy.pickEmployee}</option>
                  {others.map((person) => (
                    <option key={person.userId} value={person.userId}>{person.name}</option>
                  ))}
                </select>

                <button type="button" className="btn btn--ghost btn--sm" onClick={() => applyBulk('owner_only')}>
                  {copy.actionOwnerOnly}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" disabled={bulkTrackee === ''} onClick={() => applyBulk('transferred')}>
                  {copy.actionTransfer}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" disabled={bulkTrackee === ''} onClick={() => applyBulk('shared')}>
                  {copy.actionShare}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" disabled={bulkTrackee === ''} onClick={() => applyBulk('transfer')}>
                  {copy.actionMove}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => applyBulk('await_reassignment')}>
                  {copy.actionAwait}
                </button>
              </div>

              {work.commissions.length > 0 ? (
                <>
                  <h3 className="panel__title departure-subtitle">{copy.commissionsTitle}</h3>
                  <ul className="task-list">{work.commissions.map(renderItem)}</ul>
                </>
              ) : null}
              {work.assigned.length > 0 ? (
                <>
                  <h3 className="panel__title departure-subtitle">{copy.assignedTitle}</h3>
                  <ul className="task-list">{work.assigned.map(renderItem)}</ul>
                </>
              ) : null}

              <p className="panel__lede departure-summary">
                {copy.summary
                  .replace('{ownerOnly}', String(summary.ownerOnly))
                  .replace('{transferred}', String(summary.transferred))
                  .replace('{shared}', String(summary.shared))
                  .replace('{moved}', String(summary.moved))
                  .replace('{awaiting}', String(summary.awaiting))
                  .replace('{unset}', String(summary.unset))}
              </p>
            </>
          )}

          <div className="member-row__actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {mode === 'offboard' ? copy.confirmOffboard : copy.confirmManage}
              {busy ? <ButtonSpinner /> : null}
            </button>
            <button type="button" className="btn btn--quiet btn--sm" onClick={onClose} disabled={busy}>
              {t.messaging.cancel}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
};
