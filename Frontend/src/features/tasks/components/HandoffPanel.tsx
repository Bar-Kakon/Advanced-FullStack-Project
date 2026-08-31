import { useCallback, useEffect, useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import { decideHandoff, fetchHandoffView, initiateHandoff } from '../../../api/coordination.api';
import { fetchProjectMembers } from '../../../api/members.api';
import type { HandoffView } from '../../../api/coordination.types';
import type { ProjectMember } from '../../../api/members.types';

export interface HandoffPanelProps {
  readonly taskId: string;
  readonly projectId: string | null;
  readonly onResponsibilityChanged: () => void;
}

const EMPTY_VIEW: HandoffView = {
  handoff: null,
  mode: null,
  delegateName: null,
  currentAssigneeId: null,
};

/**
 * Moving responsibility itself, which is never delegation.
 *
 * The server decides which of the two paths this viewer may take. Authority picks from the people
 * already on the project; a delegator discloses the one person they already chose.
 */
export const HandoffPanel = ({ taskId, projectId, onResponsibilityChanged }: HandoffPanelProps) => {
  const { t } = useLanguage();
  const copy = t.coordination.handoff;

  const [view, setView] = useState<HandoffView>(EMPTY_VIEW);
  const [candidates, setCandidates] = useState<readonly ProjectMember[]>([]);
  const [toUserId, setToUserId] = useState('');
  const [completed, setCompleted] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      setView(await fetchHandoffView(taskId, signal));
    } catch {
      setView(EMPTY_VIEW);
    }
  }, [taskId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (view.mode !== 'authority' || projectId === null) {
      setCandidates([]);
      return;
    }

    const controller = new AbortController();
    fetchProjectMembers(projectId, controller.signal)
      .then((page) => {
        setCandidates(
          page.members.filter(
            (member) =>
              member.status === 'active' &&
              !member.isViewer &&
              member.userId !== view.currentAssigneeId,
          ),
        );
      })
      .catch(() => setCandidates([]));

    return () => controller.abort();
  }, [view.mode, view.currentAssigneeId, projectId]);

  const run = async (work: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
      await load();
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  };

  const open = (): void => {
    if (completed.trim() === '') {
      setError(copy.needsCompletion);
      return;
    }
    if (view.mode === 'authority' && toUserId === '') {
      setError(copy.needsPerson);
      return;
    }

    void run(async () => {
      await initiateHandoff(taskId, {
        ...(view.mode === 'authority' ? { toUserId } : {}),
        completedWorkAtHandover: completed.trim(),
      });
      setMessage(null);
      setCompleted('');
      setToUserId('');
    });
  };

  const decide = (accept: boolean): void => {
    void run(async () => {
      await decideHandoff(view.handoff?.id ?? '', accept);
      setMessage(accept ? copy.accepted : copy.declined);
      onResponsibilityChanged();
    });
  };

  const { handoff, mode } = view;
  const waiting = handoff?.state === 'awaiting_membership';

  return (
    <section className="panel" aria-labelledby="handoff-title">
      <h2 id="handoff-title" className="panel__title">{copy.title}</h2>
      <p className="panel__lede">{copy.lede}</p>

      {error === null ? null : (
        <p className="panel__lede panel__lede--error" role="alert">{error}</p>
      )}
      {message === null ? null : <p className="panel__lede" role="status">{message}</p>}

      {handoff === null ? null : (
        <>
          <p className="panel__lede" dir="auto">
            {(waiting ? copy.awaitingMembership : copy.pending)
              .replace('{from}', handoff.fromName ?? '')
              .replace('{to}', handoff.toName ?? '')}
          </p>
          {waiting ? <p className="dash-note">{copy.awaitingNote}</p> : null}
          <p className="panel__lede" dir="auto">
            {copy.completedLabel}: {handoff.completedWorkAtHandover}
          </p>
          {handoff.viewerDecides ? (
            <div className="handoff__actions">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={busy}
                onClick={() => decide(true)}
              >
                {copy.accept}
                {busy ? <ButtonSpinner /> : null}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() => decide(false)}
              >
                {copy.decline}
              </button>
            </div>
          ) : null}
        </>
      )}

      {handoff === null && mode === null ? <p className="panel__lede">{copy.none}</p> : null}

      {handoff === null && mode !== null ? (
        <div className="handoff__form">
          {mode === 'disclosure' ? (
            <>
              <p className="panel__lede">{copy.discloseDelegate}</p>
              <p className="dash-note" dir="auto">
                {copy.discloseWho.replace('{name}', view.delegateName ?? '')}
              </p>
            </>
          ) : (
            <>
              <p className="panel__lede">{copy.authorityNote}</p>
              {candidates.length === 0 ? (
                <p className="dash-note">{copy.noCandidates}</p>
              ) : (
                <div className="form-group">
                  <label className="field-label" htmlFor="handoff-to">{copy.toLabel}</label>
                  <select
                    id="handoff-to"
                    className="form-select"
                    value={toUserId}
                    disabled={busy}
                    onChange={(event) => setToUserId(event.target.value)}
                  >
                    <option value="">{copy.pickPerson}</option>
                    {candidates.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <div className="form-group">
            <label className="field-label" htmlFor="handoff-completed">{copy.completedLabel}</label>
            <textarea
              id="handoff-completed"
              className="form-input"
              rows={2}
              dir="auto"
              value={completed}
              disabled={busy}
              onChange={(event) => setCompleted(event.target.value)}
            />
          </div>

          {mode === 'authority' && candidates.length === 0 ? null : (
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={open}>
              {mode === 'disclosure' ? copy.disclose : copy.initiate}
              {busy ? <ButtonSpinner /> : null}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
};