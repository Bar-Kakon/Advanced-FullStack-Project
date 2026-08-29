import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import type { NetworkTab } from '../../../api/network.types';
import type { NetworkAction, Row } from '../useMyNetwork';

export interface NetworkRowProps {
  readonly row: Row;
  readonly tab: NetworkTab;
  readonly pending: boolean;
  readonly onAct: (action: NetworkAction, userId: string) => void;
  readonly onViewProfile: (userId: string) => void;
}

const ACTIONS: Record<NetworkTab, readonly NetworkAction[]> = {
  connected: ['remove'],
  incoming: ['accept', 'decline'],
  outgoing: ['withdraw'],
  blocked: ['unblock'],
};

const TONE: Record<NetworkAction, string> = {
  accept: 'btn--primary',
  decline: 'btn--ghost',
  withdraw: 'btn--ghost',
  remove: 'btn--ghost',
  unblock: 'btn--primary',
};

export const NetworkRow = ({ row, tab, pending, onAct, onViewProfile }: NetworkRowProps) => {
  const { t, lang } = useLanguage();
  const { person } = row;
  const name = `${person.firstName} ${person.lastName}`.trim();

  const date = new Date(row.at);
  const when = Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

  return (
    <li className="net-row">
      <div className="net-row__who">
        <p className="net-row__name" dir="auto">{name}</p>
        {person.companyName ? (
          <p className="net-row__company" dir="auto">{person.companyName}</p>
        ) : null}

        <p className="net-row__meta">
          {person.city ? <span dir="auto">{person.city}</span> : null}
          {person.availability ? <span>{t.availability[person.availability]}</span> : null}
          {when ? <span>{t.network.since[tab].replace('{date}', when)}</span> : null}
        </p>
      </div>

      <div className="net-row__actions">
        {/* A blocked person's public profile answers 404 by design, so no link is offered here. */}
        {tab === 'blocked' ? null : (
          <button
            type="button"
            className="btn btn--quiet btn--sm"
            onClick={() => onViewProfile(person.userId)}
          >
            {t.network.actions.viewProfile}
          </button>
        )}

        {ACTIONS[tab].map((action) => (
          <button
            key={action}
            type="button"
            className={`btn ${TONE[action]} btn--sm`}
            disabled={pending}
            onClick={() => onAct(action, person.userId)}
          >
            {t.network.actions[action]}
            {pending ? <ButtonSpinner /> : null}
          </button>
        ))}
      </div>
    </li>
  );
};
