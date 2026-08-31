import { useCallback, useEffect, useRef, useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import type { WorkPlan, WorkPlanVisibility } from '../../../api/workPlans.types';
import {
  fetchTaskWorkPlans,
  fetchWorkPlanVersions,
  markWorkPlanVersionCurrent,
  uploadTaskWorkPlan,
  uploadWorkPlanVersion,
} from '../../../api/workPlans.api';

export interface WorkPlansPanelProps {
  readonly taskId: string;
  /** Whether this viewer is a party to the work, which is what the private channel is for. */
  readonly canExchangePrivately: boolean;
}

const megabytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * The versioned plans on one task.
 *
 * Every authority question is answered by the server: this panel offers controls and shows what
 * comes back. A private plan is one the delegator and delegate exchange, and the party above is
 * never sent it — so its absence here is the server's answer, not a filter applied on the client.
 */
export const WorkPlansPanel = ({ taskId, canExchangePrivately }: WorkPlansPanelProps) => {
  const { t } = useLanguage();
  const copy = t.tasks.detail.workPlans;

  const [plans, setPlans] = useState<readonly WorkPlan[]>([]);
  const [history, setHistory] = useState<Record<string, readonly WorkPlan[]>>({});
  const [visibility, setVisibility] = useState<WorkPlanVisibility>('shared');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newPlanInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      setPlans(await fetchTaskWorkPlans(taskId, signal));
    } catch {
      setError(copy.loadFailed);
    }
  }, [taskId, copy.loadFailed]);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await reload();
    } catch {
      setError(copy.actionFailed);
    } finally {
      setBusy(false);
    }
  };

  const onNewPlan = (file: File | undefined): void => {
    if (!file) return;
    void run(async () => {
      await uploadTaskWorkPlan(taskId, file, visibility);
      if (newPlanInput.current) newPlanInput.current.value = '';
    });
  };

  const onNewVersion = (planId: string, file: File | undefined): void => {
    if (!file) return;
    void run(async () => {
      await uploadWorkPlanVersion(planId, file);
      setHistory((current) => ({ ...current, [planId]: [] }));
    });
  };

  const onShowHistory = (planId: string): void => {
    void run(async () => {
      setHistory((current) => ({ ...current, [planId]: [] }));
      const versions = await fetchWorkPlanVersions(planId);
      setHistory((current) => ({ ...current, [planId]: versions }));
    });
  };

  const onMakeCurrent = (planId: string, version: number): void => {
    void run(async () => {
      const versions = await markWorkPlanVersionCurrent(planId, version);
      setHistory((current) => ({ ...current, [planId]: versions }));
    });
  };

  return (
    <section className="panel" aria-labelledby="work-plans-title">
      <h2 id="work-plans-title" className="panel__title">{copy.title}</h2>
      <p className="panel__lede">{copy.lede}</p>

      {error === null ? null : <p className="panel__lede panel__lede--error" role="alert">{error}</p>}

      {plans.length === 0 ? (
        <p className="panel__lede">{copy.none}</p>
      ) : (
        <ul className="plan-list">
          {plans.map((plan) => (
            <li key={plan.planId} className="plan-item">
              <div className="plan-item__head">
                <a
                  className="plan-item__name"
                  href={`/api/work-plans/assets/${plan.id}/content`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {plan.filename}
                </a>
                <span className="plan-item__meta">
                  {copy.versionLabel.replace('{n}', String(plan.version))} · {megabytes(plan.sizeBytes)}
                  {plan.visibility === 'private' ? ` · ${copy.private}` : ''}
                </span>
                {plan.uploadedByName === null ? null : (
                  <span className="plan-item__meta">{copy.by.replace('{name}', plan.uploadedByName)}</span>
                )}
              </div>

              <div className="plan-item__actions">
                <label className="btn btn--ghost btn--sm">
                  {copy.newVersion}
                  <input
                    type="file"
                    accept="application/pdf"
                    hidden
                    disabled={busy}
                    onChange={(event) => onNewVersion(plan.planId, event.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() => onShowHistory(plan.planId)}
                >
                  {copy.history}
                </button>
              </div>

              {history[plan.planId] === undefined ? null : (
                <ul className="plan-history">
                  {history[plan.planId]?.map((version) => (
                    <li key={version.id} className="plan-history__row">
                      <a href={`/api/work-plans/assets/${version.id}/content`} target="_blank" rel="noreferrer">
                        {copy.versionLabel.replace('{n}', String(version.version))}
                      </a>
                      {version.isCurrent ? (
                        <span className="plan-history__current">{copy.current}</span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busy}
                          onClick={() => onMakeCurrent(plan.planId, version.version)}
                        >
                          {copy.makeCurrent}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="plan-upload">
        {canExchangePrivately ? (
          <fieldset className="plan-upload__visibility">
            <legend className="field-label">{copy.visibility.legend}</legend>
            {(['shared', 'private'] as const).map((value) => (
              <label key={value} className="perm-check">
                <input
                  type="radio"
                  name="work-plan-visibility"
                  value={value}
                  checked={visibility === value}
                  disabled={busy}
                  onChange={() => setVisibility(value)}
                />
                <span>{copy.visibility[value]}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <label className="btn btn--primary btn--sm">
          {copy.add}
          {busy ? <ButtonSpinner /> : null}
          <input
            ref={newPlanInput}
            type="file"
            accept="application/pdf"
            hidden
            disabled={busy}
            onChange={(event) => onNewPlan(event.target.files?.[0])}
          />
        </label>
        <p className="panel__lede">{copy.limits}</p>
      </div>
    </section>
  );
};
