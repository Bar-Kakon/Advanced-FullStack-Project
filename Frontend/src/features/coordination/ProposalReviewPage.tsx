import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import {
  cancelProposal,
  launchProposal,
  resolveProposal,
  respondToItem,
  setItemExcluded,
} from '../../api/coordination.api';
import {
  JUSTIFIED_DECLINE_REASONS,
  type ItemResolution,
  type Proposal,
  type ProposalItem,
} from '../../api/coordination.types';
import { AlternativesPanel } from './components/AlternativesPanel';
import { useProposal } from './useProposal';
import profileCss from '../profile/profile.css?inline';
import tasksCss from '../tasks/tasks.css?inline';
import coordinationCss from './coordination.css?inline';

const displayDate = (iso: string, lang: 'he' | 'en'): string => {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(
    lang === 'he' ? 'he-IL' : 'en-GB',
    { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' },
  );
};

const defaultResolutionFor = (item: ProposalItem): ItemResolution => {
  if (item.excluded) return 'none';
  if (item.response === 'countered') return 'counter';
  if (item.response === 'other_proposed') return 'other';
  if (item.response === 'accepted') return 'proposed';
  return 'none';
};

export const ProposalReviewPage = () => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { proposalId = '' } = useParams<{ proposalId: string }>();
  const { proposal, loading, busy, failed, actionFailed, act, replace } = useProposal(proposalId);

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'tasks.css', css: tasksCss },
    { id: 'coordination.css', css: coordinationCss },
  );
  useDocumentTitle('בקשת שינוי לוח זמנים / Schedule change request — Blokta');

  const copy = t.coordination;
  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';

  const [answering, setAnswering] = useState<string | null>(null);
  const [mode, setMode] = useState<'accepted' | 'declined' | 'countered' | 'other_proposed'>('accepted');
  const [otherSolution, setOtherSolution] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [counterStart, setCounterStart] = useState('');
  const [counterDue, setCounterDue] = useState('');
  const [decisions, setDecisions] = useState<Record<string, ItemResolution>>({});
  const [note, setNote] = useState('');

  const date = (value: string): string => displayDate(value, lang);

  const send = (item: ProposalItem): void => {
    void act(async () => {
      const next = await respondToItem(proposalId, item.id, {
        response: mode,
        ...(mode === 'declined' && declineReason !== ''
          ? { declineReason: declineReason as (typeof JUSTIFIED_DECLINE_REASONS)[number] }
          : {}),
        ...(mode === 'countered' ? { counterStart, counterDue } : {}),
        ...(mode === 'other_proposed' ? { otherSolution } : {}),
      });
      setAnswering(null);
      return next;
    });
  };

  const resolutionOf = (item: ProposalItem): ItemResolution =>
    decisions[item.id] ?? defaultResolutionFor(item);

  const decide = (current: Proposal): void => {
    void act(() =>
      resolveProposal(
        proposalId,
        current.items.map((item) => ({ itemId: item.id, resolution: resolutionOf(item) })),
        note,
      ),
    );
  };

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{copy.title}</h1>
            <p className="profile__sub">{copy.subtitle}</p>
          </div>
          <div className="profile__head-actions">
            {proposal === null ? null : (
              <Link to={`/tasks/${proposal.initiatingTaskId}`} className="btn btn--ghost btn--sm">
                {copy.backToTask}
              </Link>
            )}
          </div>
        </header>

        {failed ? (
          <section className="panel">
            <FormAlert message={copy.notFound} />
          </section>
        ) : null}

        {loading ? <p className="panel__lede">{copy.loading}</p> : null}

        {proposal === null || failed ? null : (
          <>
            {actionFailed ? (
              <section className="panel">
                <FormAlert message={copy.actions.failed} />
              </section>
            ) : null}

            <section className="panel" aria-labelledby="proposal-state">
              <h2 id="proposal-state" className="panel__title">{copy.status.label}</h2>
              <p className="prop-status">
                <span className={`prop-chip prop-chip--${proposal.status}`}>
                  {copy.status[proposal.status]}
                </span>
              </p>
              <p className="panel__lede">{copy.statusNote[proposal.status]}</p>

              <p className="panel__lede" dir="auto">
                {proposal.requestedByMe
                  ? copy.requestedByMe
                  : copy.requestedBy.replace('{name}', proposal.requestedByName ?? '')}
              </p>
              <p className="panel__lede" dir="auto">
                {copy.initiating}: {proposal.initiatingTaskTitle}
              </p>
              {proposal.reason === null ? null : (
                <p className="panel__lede" dir="auto">{copy.reason}: {proposal.reason}</p>
              )}
              <p className="panel__lede">
                {proposal.expiresAt === null
                  ? copy.noWindow
                  : copy.window.replace('{date}', date(proposal.expiresAt))}
              </p>
              <p className="panel__lede">
                {copy.windowHours.replace('{n}', String(proposal.responseHours))}
              </p>
              {proposal.resolvedAt === null ? null : (
                <p className="panel__lede">
                  {copy.resolution.resolvedAt.replace('{date}', date(proposal.resolvedAt))}
                  {proposal.resolutionNote === null ? '' : ` — ${proposal.resolutionNote}`}
                </p>
              )}
            </section>

            <section className="panel" aria-labelledby="proposal-changes">
              <h2 id="proposal-changes" className="panel__title">{copy.changes.title}</h2>
              <ul className="prop-changes">
                {proposal.changes.deltaWorkingDays === null ? null : (
                  <li>
                    {proposal.changes.deltaWorkingDays >= 0
                      ? copy.changes.days.replace('{n}', String(proposal.changes.deltaWorkingDays))
                      : copy.changes.daysNegative.replace('{n}', String(-proposal.changes.deltaWorkingDays))}
                  </li>
                )}
                {proposal.changes.alternativeStart === null ? null : (
                  <li>{copy.changes.altStart.replace('{date}', date(proposal.changes.alternativeStart))}</li>
                )}
                {proposal.changes.alternativeDue === null ? null : (
                  <li>{copy.changes.altDue.replace('{date}', date(proposal.changes.alternativeDue))}</li>
                )}
              </ul>
            </section>

            <section className="panel" aria-labelledby="proposal-impact">
              <h2 id="proposal-impact" className="panel__title">{copy.impact.title}</h2>
              <p className="panel__lede">{copy.impact.lede}</p>
              {proposal.ceiling === null ? null : (
                <p className={`panel__lede${proposal.ceiling.exceeded ? ' panel__lede--error' : ''}`}>
                  {proposal.ceiling.exceeded
                    ? copy.impact.ceilingExceeded
                    : copy.impact.ceiling.replace('{date}', date(proposal.ceiling.ceilingDate))}
                </p>
              )}
              {!proposal.viewer.seesResponseMatrix ? (
                <p className="panel__lede">{copy.response.othersHidden}</p>
              ) : null}

              {proposal.items.length === 0 ? (
                <p className="panel__lede">{copy.impact.empty}</p>
              ) : (
                <div className="prop-table-wrap">
                  <table className="prop-table">
                    <thead>
                      <tr>
                        <th scope="col">{copy.impact.task}</th>
                        <th scope="col">{copy.impact.stage}</th>
                        {proposal.viewer.seesResponseMatrix ? (
                          <th scope="col">{copy.impact.professional}</th>
                        ) : null}
                        <th scope="col">{copy.impact.current}</th>
                        <th scope="col">{copy.impact.proposed}</th>
                        <th scope="col">{copy.impact.reasonLabel}</th>
                        <th scope="col">{copy.response.label}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposal.items.map((item) => (
                        <tr key={item.id} className={item.excluded ? 'prop-row--excluded' : undefined}>
                          <td dir="auto">
                            {item.taskTitle}
                            {item.isMine ? <span className="prop-mine">{copy.response.mine}</span> : null}
                          </td>
                          <td dir="auto">{item.stageName ?? '—'}</td>
                          {proposal.viewer.seesResponseMatrix ? (
                            <td dir="auto">{item.respondentName ?? '—'}</td>
                          ) : null}
                          <td>{date(item.currentStart)} – {date(item.currentDue)}</td>
                          <td>{date(item.proposedStart)} – {date(item.proposedDue)}</td>
                          <td>{copy.reasonCode[item.reason]}</td>
                          <td>
                            <span className={`prop-chip prop-chip--${item.response}`}>
                              {copy.response[item.response]}
                            </span>
                            {item.excluded ? (
                              <span className="prop-note">{copy.response.excluded}</span>
                            ) : null}
                            {item.counterStart !== null && item.counterDue !== null ? (
                              <span className="prop-note">
                                {copy.response.counterDates
                                  .replace('{start}', date(item.counterStart))
                                  .replace('{due}', date(item.counterDue))}
                              </span>
                            ) : null}
                            {item.otherSolution === null ? null : (
                              <span className="prop-note" dir="auto">
                                {copy.resolution.other}: {item.otherSolution}
                              </span>
                            )}
                            {item.declineReason === null ? null : (
                              <span className="prop-note">
                                {copy.response.declineReason}: {copy.declineReason[item.declineReason]}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {proposal.summary === null ? null : (
                <p className="panel__lede">
                  {copy.impact.gateCount.replace(
                    '{n}',
                    String(proposal.items.filter((item) => item.reason === 'gate').length),
                  )}
                </p>
              )}
            </section>

            {proposal.viewer.respondableItemIds.length === 0 ? null : (
              <section className="panel" aria-labelledby="proposal-answer">
                <h2 id="proposal-answer" className="panel__title">{copy.response.title}</h2>
                {proposal.items
                  .filter((item) => proposal.viewer.respondableItemIds.includes(item.id))
                  .map((item) => (
                    <div key={item.id} className="prop-answer">
                      <p className="panel__lede" dir="auto">{item.taskTitle}</p>

                      {answering === item.id ? (
                        <>
                          <fieldset className="prop-modes">
                            <legend className="field-label">{copy.response.label}</legend>
                            {(['accepted', 'declined', 'countered', 'other_proposed'] as const).map((value) => (
                              <label key={value} className="perm-check">
                                <input
                                  type="radio"
                                  name={`mode-${item.id}`}
                                  checked={mode === value}
                                  disabled={busy}
                                  onChange={() => setMode(value)}
                                />
                                <span>
                                  {value === 'accepted'
                                    ? copy.actions.accept
                                    : value === 'declined'
                                      ? copy.actions.decline
                                      : value === 'countered'
                                        ? copy.actions.counter
                                        : copy.actions.other}
                                </span>
                              </label>
                            ))}
                          </fieldset>

                          {mode === 'declined' ? (
                            <label className="field">
                              <span className="field-label" id={`dr-${item.id}`}>
                                {copy.actions.declineReasonLabel}
                              </span>
                              <select
                                className="input"
                                aria-labelledby={`dr-${item.id}`}
                                value={declineReason}
                                disabled={busy}
                                onChange={(event) => setDeclineReason(event.target.value)}
                              >
                                <option value="">{copy.actions.noReason}</option>
                                {JUSTIFIED_DECLINE_REASONS.map((reason) => (
                                  <option key={reason} value={reason}>
                                    {copy.declineReason[reason]}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}

                          {mode === 'other_proposed' ? (
                            <label className="field">
                              <span className="field-label" id={`os-${item.id}`}>
                                {copy.actions.otherLabel}
                              </span>
                              <textarea
                                className="input"
                                rows={2}
                                aria-labelledby={`os-${item.id}`}
                                value={otherSolution}
                                disabled={busy}
                                onChange={(event) => setOtherSolution(event.target.value)}
                              />
                            </label>
                          ) : null}

                          {mode === 'countered' ? (
                            <div className="prop-counter">
                              <label className="field">
                                <span className="field-label" id={`cs-${item.id}`}>
                                  {copy.actions.counterStart}
                                </span>
                                <input
                                  type="date"
                                  className="input"
                                  aria-labelledby={`cs-${item.id}`}
                                  value={counterStart}
                                  disabled={busy}
                                  onChange={(event) => setCounterStart(event.target.value)}
                                />
                              </label>
                              <label className="field">
                                <span className="field-label" id={`cd-${item.id}`}>
                                  {copy.actions.counterDue}
                                </span>
                                <input
                                  type="date"
                                  className="input"
                                  aria-labelledby={`cd-${item.id}`}
                                  value={counterDue}
                                  disabled={busy}
                                  onChange={(event) => setCounterDue(event.target.value)}
                                />
                              </label>
                            </div>
                          ) : null}

                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            disabled={busy}
                            onClick={() => send(item)}
                          >
                            {copy.actions.send}
                            {busy ? <ButtonSpinner /> : null}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          disabled={busy}
                          onClick={() => setAnswering(item.id)}
                        >
                          {copy.actions.send}
                        </button>
                      )}
                    </div>
                  ))}
              </section>
            )}

            {proposal.viewer.canAdjustImpact && proposal.status === 'requested' ? (
              <AlternativesPanel proposal={proposal} onSelected={replace} />
            ) : null}

            {proposal.viewer.seesResponseMatrix ? (
              <section className="panel" aria-labelledby="proposal-decide">
                <h2 id="proposal-decide" className="panel__title">{copy.actions.resolve}</h2>
                <p className="panel__lede">{copy.actions.resolveNote}</p>

                {proposal.viewer.canLaunch ? (
                  <>
                    <p className="panel__lede">{copy.actions.launchNote}</p>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={busy}
                      onClick={() => void act(() => launchProposal(proposalId))}
                    >
                      {copy.actions.launch}
                      {busy ? <ButtonSpinner /> : null}
                    </button>
                  </>
                ) : null}

                {proposal.viewer.canAdjustImpact ? (
                  <ul className="prop-adjust">
                    {proposal.items.map((item) => (
                      <li key={item.id}>
                        <span dir="auto">{item.taskTitle}</span>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busy}
                          onClick={() => void act(() => setItemExcluded(proposalId, item.id, !item.excluded))}
                        >
                          {item.excluded ? copy.actions.include : copy.actions.exclude}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {proposal.viewer.canResolve ? (
                  <>
                    <ul className="prop-decisions">
                      {proposal.items.map((item) => (
                        <li key={item.id}>
                          <label className="field">
                            <span className="field-label" id={`res-${item.id}`} dir="auto">
                              {item.taskTitle} — {copy.resolution.label}
                            </span>
                            <select
                              className="input"
                              aria-labelledby={`res-${item.id}`}
                              value={resolutionOf(item)}
                              disabled={busy}
                              onChange={(event) =>
                                setDecisions((current) => ({
                                  ...current,
                                  [item.id]: event.target.value as ItemResolution,
                                }))
                              }
                            >
                              <option value="none">{copy.resolution.none}</option>
                              <option value="proposed">{copy.resolution.proposed}</option>
                              {item.response === 'countered' ? (
                                <option value="counter">{copy.resolution.counter}</option>
                              ) : null}
                              {item.response === 'other_proposed' ? (
                                <option value="other">{copy.resolution.other}</option>
                              ) : null}
                              <option value="replaced">{copy.resolution.replaced}</option>
                            </select>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <p className="panel__lede">{copy.resolution.replacedNote}</p>

                    <label className="field">
                      <span className="field-label" id="resolve-note">{copy.actions.resolveNoteLabel}</span>
                      <textarea
                        className="input"
                        rows={2}
                        aria-labelledby="resolve-note"
                        value={note}
                        disabled={busy}
                        onChange={(event) => setNote(event.target.value)}
                      />
                    </label>

                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={busy}
                      onClick={() => decide(proposal)}
                    >
                      {copy.actions.resolve}
                      {busy ? <ButtonSpinner /> : null}
                    </button>
                  </>
                ) : null}

                {proposal.viewer.canCancel ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={busy}
                    onClick={() => void act(() => cancelProposal(proposalId))}
                  >
                    {copy.actions.cancel}
                    {busy ? <ButtonSpinner /> : null}
                  </button>
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
};
