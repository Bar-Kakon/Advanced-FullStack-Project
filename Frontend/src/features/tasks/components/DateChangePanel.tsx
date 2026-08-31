import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import { previewDateChange, requestDateChange } from '../../../api/coordination.api';
import type { DateChangeInput, ImpactPreview } from '../../../api/coordination.types';

export interface DateChangePanelProps {
  readonly taskId: string;
  readonly available: boolean;
  readonly impact: number | null;
}

export const DateChangePanel = ({ taskId, available, impact }: DateChangePanelProps) => {
  const { t } = useLanguage();
  const copy = t.tasks.detail.dateChange;

  const [days, setDays] = useState('');
  const [altStart, setAltStart] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<ImpactPreview | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = (): DateChangeInput => ({
    ...(days.trim() === '' ? {} : { deltaWorkingDays: Number(days) }),
    ...(altStart === '' ? {} : { alternativeStart: altStart }),
    ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
  });

  const empty = days.trim() === '' && altStart === '';

  const run = async (work: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  };

  const onPreview = (): void => {
    if (empty) {
      setError(copy.emptyChange);
      return;
    }
    void run(async () => {
      setSentId(null);
      setPreview(await previewDateChange(taskId, input()));
    });
  };

  const onSubmit = (): void => {
    if (empty) {
      setError(copy.emptyChange);
      return;
    }
    void run(async () => {
      const proposal = await requestDateChange(taskId, input());
      setSentId(proposal.id);
      setPreview(null);
    });
  };

  return (
    <section className="panel" aria-labelledby="date-change-title">
      <h2 id="date-change-title" className="panel__title">{copy.title}</h2>
      <p className="panel__lede">{copy.lede}</p>

      {impact === null ? null : (
        <p className="panel__lede">
          {impact === 0 ? copy.impactNone : copy.impact.replace('{n}', String(impact))}
        </p>
      )}

      {error === null ? null : (
        <p className="panel__lede panel__lede--error" role="alert">{error}</p>
      )}

      {sentId === null ? null : (
        <p className="panel__lede" role="status">
          {copy.sent}{' '}
          <Link to={`/proposals/${sentId}`} className="link">{copy.openRequest}</Link>
        </p>
      )}

      {available ? (
        <div className="date-change">
          <label className="field">
            <span className="field-label" id="dc-days-label">{copy.daysLabel}</span>
            <input
              type="number"
              className="input"
              inputMode="numeric"
              aria-labelledby="dc-days-label"
              value={days}
              disabled={busy}
              onChange={(event) => setDays(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label" id="dc-start-label">{copy.altStartLabel}</span>
            <input
              type="date"
              className="input"
              aria-labelledby="dc-start-label"
              value={altStart}
              disabled={busy}
              onChange={(event) => setAltStart(event.target.value)}
            />
          </label>

          <label className="field date-change__reason">
            <span className="field-label" id="dc-reason-label">{copy.reasonLabel}</span>
            <textarea
              className="input"
              rows={2}
              aria-labelledby="dc-reason-label"
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>

          <div className="date-change__actions">
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={onPreview}>
              {copy.preview}
              {busy ? <ButtonSpinner /> : null}
            </button>
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={onSubmit}>
              {copy.submit}
              {busy ? <ButtonSpinner /> : null}
            </button>
          </div>
        </div>
      ) : null}

      {preview === null ? null : (
        <div className="date-change__preview">
          <p className="panel__lede">{copy.affected.replace('{n}', String(preview.affectedCount))}</p>
          <p className="panel__lede">{copy.others.replace('{n}', String(preview.otherProfessionalsCount))}</p>
          <p className="panel__lede">{copy.unaffected.replace('{n}', String(preview.unaffectedCount))}</p>
          {preview.ceiling.exceeded ? (
            <p className="panel__lede panel__lede--error" role="alert">{copy.beyondCeiling}</p>
          ) : null}
        </div>
      )}
    </section>
  );
};
