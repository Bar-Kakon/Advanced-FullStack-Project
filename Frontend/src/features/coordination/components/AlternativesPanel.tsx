import { useEffect, useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import { fetchAlternatives, requestAlternatives, selectAlternative } from '../../../api/coordination.api';
import type { AlternativesView, ExplanationEntry, Proposal } from '../../../api/coordination.types';

export interface AlternativesPanelProps {
  readonly proposal: Proposal;
  readonly onSelected: (next: Proposal) => void;
}

const explain = (
  entry: ExplanationEntry,
  copy: Record<string, string>,
): string => {
  const template = copy[entry.code] ?? entry.code;
  const count =
    entry.candidatesEliminated ??
    entry.anchorsUnavailable ??
    entry.outcomesCollapsed ??
    entry.arrangementsForced ??
    0;

  return template
    .replace('{n}', String(count))
    .replace('{date}', entry.date ?? '')
    .replace('{titles}', entry.taskTitles.join(' · '));
};

export const AlternativesPanel = ({ proposal, onSelected }: AlternativesPanelProps) => {
  const { t } = useLanguage();
  const copy = t.coordination.alternatives;
  const reasons = t.coordination.explanation as unknown as Record<string, string>;

  const [view, setView] = useState<AlternativesView | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [earliestStart, setEarliestStart] = useState('');
  const [latestForWork, setLatestForWork] = useState('');
  const [latestForChain, setLatestForChain] = useState('');
  const [mustNotMove, setMustNotMove] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        setView(await fetchAlternatives(proposal.id));
      } catch {
        setFailed(true);
      }
    })();
  }, [proposal.id]);

  const run = async (work: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await work();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const create = (): void => {
    void run(async () => {
      setView(
        await requestAlternatives(proposal.id, {
          ...(earliestStart === '' ? {} : { earliestStart }),
          ...(latestForWork === '' ? {} : { latestFinishForWork: latestForWork }),
          ...(latestForChain === '' ? {} : { latestFinishForChain: latestForChain }),
          ...(mustNotMove.trim() === ''
            ? {}
            : { mustNotMove: mustNotMove.split(',').map((id) => id.trim()).filter((id) => id !== '') }),
          ...(note.trim() === '' ? {} : { note: note.trim() }),
        }),
      );
    });
  };

  const choose = (token: string): void => {
    void run(async () => {
      onSelected(await selectAlternative(proposal.id, token));
      setView(await fetchAlternatives(proposal.id));
    });
  };

  return (
    <section className="panel" aria-labelledby="alternatives-title">
      <h2 id="alternatives-title" className="panel__title">{copy.title}</h2>
      <p className="panel__lede">{copy.lede}</p>

      {failed ? <p className="panel__lede panel__lede--error" role="alert">{copy.notRequested}</p> : null}

      <div className="alt-constraints">
        <label className="field">
          <span className="field-label" id="alt-earliest">{copy.earliestStart}</span>
          <input
            type="date"
            className="input"
            aria-labelledby="alt-earliest"
            value={earliestStart}
            disabled={busy}
            onChange={(event) => setEarliestStart(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label" id="alt-work">{copy.latestFinishForWork}</span>
          <input
            type="date"
            className="input"
            aria-labelledby="alt-work"
            value={latestForWork}
            disabled={busy}
            onChange={(event) => setLatestForWork(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label" id="alt-chain">{copy.latestFinishForChain}</span>
          <input
            type="date"
            className="input"
            aria-labelledby="alt-chain"
            value={latestForChain}
            disabled={busy}
            onChange={(event) => setLatestForChain(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label" id="alt-fixed">{copy.mustNotMove}</span>
          <input
            className="input"
            aria-labelledby="alt-fixed"
            value={mustNotMove}
            disabled={busy}
            onChange={(event) => setMustNotMove(event.target.value)}
          />
        </label>
        <label className="field alt-constraints__note">
          <span className="field-label" id="alt-note">{copy.note}</span>
          <textarea
            className="input"
            rows={2}
            aria-labelledby="alt-note"
            value={note}
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
      <p className="panel__lede">{copy.noteIsContext}</p>

      <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={create}>
        {view?.requested === true ? copy.recalculate : copy.create}
        {busy ? <ButtonSpinner /> : null}
      </button>

      {view === null || !view.requested ? (
        <p className="panel__lede">{copy.notRequested}</p>
      ) : (
        <>
          {view.candidates.length === 0 ? <p className="panel__lede">{copy.none}</p> : null}
          {view.candidates.length === 1 ? <p className="panel__lede">{copy.singleResult}</p> : null}

          {view.candidates.length > 0 ? (
            <ul className="alt-list">
              {view.candidates.map((candidate) => (
                <li key={candidate.token} className="alt-item">
                  <p className="alt-item__window">
                    {copy.window.replace('{start}', candidate.startDate).replace('{due}', candidate.dueDate)}
                  </p>
                  <p className="alt-item__meta">
                    <span>{copy.affected.replace('{n}', String(candidate.affectedTaskCount))}</span>
                    <span>{copy.professionals.replace('{n}', String(candidate.affectedProfessionalCount))}</span>
                    <span>{copy.chainEnds.replace('{date}', candidate.latestFinishInArrangement)}</span>
                  </p>
                  {candidate.onlyInitiatingWorkMoves ? (
                    <p className="alt-item__meta">{copy.onlyInitiating}</p>
                  ) : null}
                  {candidate.equivalentAnchorCount > 1 ? (
                    <p className="alt-item__meta">
                      {copy.equivalent.replace('{n}', String(candidate.equivalentAnchorCount - 1))}
                    </p>
                  ) : null}
                  {candidate.selected ? (
                    <span className="prop-chip prop-chip--accepted">{copy.selected}</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy}
                      onClick={() => choose(candidate.token)}
                    >
                      {copy.select}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {view.sweepTruncated ? (
            <p className="panel__lede">{copy.truncated.replace('{n}', String(view.anchorsEvaluated))}</p>
          ) : null}

          {view.explanation.length === 0 ? null : (
            <>
              <h3 className="panel__title">{copy.whyTitle}</h3>
              <ul className="alt-why">
                {view.explanation.map((entry) => (
                  <li key={entry.code}>{explain(entry, reasons)}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
};
