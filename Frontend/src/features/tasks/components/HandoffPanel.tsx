import { useCallback, useEffect, useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import { decideHandoff, fetchHandoff, initiateHandoff } from '../../../api/coordination.api';
import type { Handoff } from '../../../api/coordination.types';

export interface HandoffPanelProps {
  readonly taskId: string;
  readonly canInitiate: boolean;
  readonly hasDelegation: boolean;
  readonly onResponsibilityChanged: () => void;
}

export const HandoffPanel = ({
  taskId,
  canInitiate,
  hasDelegation,
  onResponsibilityChanged,
}: HandoffPanelProps) => {
  const { t } = useLanguage();
  const copy = t.coordination.handoff;

  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [toUserId, setToUserId] = useState('');
  const [completed, setCompleted] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      setHandoff(await fetchHandoff(taskId, signal));
    } catch {
      setHandoff(null);
    }
  }, [taskId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

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
    void run(async () => {
      await initiateHandoff(taskId, { toUserId: toUserId.trim(), completedWorkAtHandover: completed.trim() });
      setMessage(null);
    });
  };

  const decide = (accept: boolean): void => {
    void run(async () => {
      await decideHandoff(handoff?.id ?? '', accept);
      setMessage(accept ? copy.accepted : copy.declined);
      onResponsibilityChanged();
    });
  };

  return (
    <section className="panel" aria-labelledby="handoff-title">
      <h2 id="handoff-title" className="panel__title">{copy.title}</h2>
      <p className="panel__lede">{copy.lede}</p>

      {error === null ? null : (
        <p className="panel__lede panel__lede--error" role="alert">{error}</p>
      )}
      {message === null ? null : <p className="panel__lede" role="status">{message}</p>}

      {handoff === null ? (
        <p className="panel__lede">{copy.none}</p>
      ) : (
        <>
          <p className="panel__lede" dir="auto">
            {copy.pending
              .replace('{from}', handoff.fromName ?? '')
              .replace('{to}', handoff.toName ?? '')}
          </p>
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

      {handoff === null && canInitiate ? (
        <div className="handoff__form">
          {hasDelegation ? <p className="panel__lede">{copy.discloseDelegate}</p> : null}

          <label className="field">
            <span className="field-label" id="handoff-to">{copy.toLabel}</span>
            <input
              className="input"
              aria-labelledby="handoff-to"
              value={toUserId}
              disabled={busy}
              onChange={(event) => setToUserId(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label" id="handoff-completed">{copy.completedLabel}</span>
            <textarea
              className="input"
              rows={2}
              aria-labelledby="handoff-completed"
              value={completed}
              disabled={busy}
              onChange={(event) => setCompleted(event.target.value)}
            />
          </label>

          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={open}>
            {copy.initiate}
            {busy ? <ButtonSpinner /> : null}
          </button>
        </div>
      ) : null}
    </section>
  );
};
