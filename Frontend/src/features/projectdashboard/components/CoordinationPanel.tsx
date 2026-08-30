import { Link } from 'react-router-dom';

import { useLanguage } from '../../../i18n/useLanguage';
import type { AuditEntry, ProposalListRow } from '../../../api/coordination.types';

export interface CoordinationPanelProps {
  readonly openProposals: number;
  readonly awaitingMe: number;
  readonly proposals: readonly ProposalListRow[];
  readonly audit: readonly AuditEntry[];
  readonly seesEverything: boolean;
}

const stamp = (iso: string, lang: 'he' | 'en'): string =>
  new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

export const CoordinationPanel = ({
  openProposals,
  awaitingMe,
  proposals,
  audit,
  seesEverything,
}: CoordinationPanelProps) => {
  const { t, lang } = useLanguage();
  const copy = t.coordination;

  return (
    <>
      <section className="panel" aria-labelledby="coordination-title">
        <h2 id="coordination-title" className="panel__title">{copy.project.title}</h2>
        <p className="panel__lede">{copy.project.lede}</p>
        <p className="panel__lede">
          {copy.project.open.replace('{n}', String(openProposals))}
          {' · '}
          {copy.project.awaitingMe.replace('{n}', String(awaitingMe))}
        </p>

        {proposals.length === 0 ? (
          <p className="panel__lede">{copy.project.none}</p>
        ) : (
          <ul className="prop-list">
            {proposals.map((row) => (
              <li key={row.id} className="prop-list__row">
                <div className="prop-list__head">
                  <h3 className="prop-list__title" dir="auto">{row.initiatingTaskTitle}</h3>
                  <span className={`prop-chip prop-chip--${row.status}`}>{copy.status[row.status]}</span>
                </div>
                <p className="prop-list__meta">
                  <span>{copy.project.affected.replace('{n}', String(row.affectedCount))}</span>
                  {row.pendingCount === null ? null : (
                    <span>{copy.project.pending.replace('{n}', String(row.pendingCount))}</span>
                  )}
                  {row.requestedByName === null ? null : (
                    <span dir="auto">{copy.requestedBy.replace('{name}', row.requestedByName)}</span>
                  )}
                  {row.expiresAt === null ? null : (
                    <span>{copy.window.replace('{date}', stamp(row.expiresAt, lang))}</span>
                  )}
                  {row.awaitingMe ? (
                    <span className="prop-awaiting">{copy.project.awaitingLabel}</span>
                  ) : null}
                </p>
                <p className="prop-list__meta">
                  <Link to={`/proposals/${row.id}`} className="btn btn--ghost btn--sm">
                    {copy.project.openRow}
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="audit-title">
        <h2 id="audit-title" className="panel__title">{copy.audit.title}</h2>
        <p className="panel__lede">{copy.audit.lede}</p>
        {seesEverything ? null : <p className="panel__lede">{copy.audit.partial}</p>}

        {audit.length === 0 ? (
          <p className="panel__lede">{copy.audit.empty}</p>
        ) : (
          <ul className="audit-list">
            {audit.map((entry) => (
              <li key={entry.id} className="audit-list__row">
                <p className="audit-list__what">
                  {copy.auditAction[entry.action as keyof typeof copy.auditAction] ?? entry.action}
                </p>
                <p className="audit-list__meta">
                  <span>{stamp(entry.at, lang)}</span>
                  {entry.actorName === '' ? null : (
                    <span dir="auto"> · {copy.audit.by.replace('{name}', entry.actorName)}</span>
                  )}
                  {entry.taskTitle === null ? null : <span dir="auto"> · {entry.taskTitle}</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
};
