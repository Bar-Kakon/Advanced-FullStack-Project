import { useEffect, useState } from 'react';

import { useLanguage } from '../../../i18n/useLanguage';
import { fetchNetworkGroup } from '../../../api/network.api';
import type { NetworkRow } from '../../../api/network.types';
import { StartMessageDialog } from './StartMessageDialog';

export interface NewMessageDialogProps {
  readonly onClose: () => void;
  readonly onOpened: (conversationId: string) => void;
}

/**
 * The inbox's own entry point: pick a connected person, write the first message. A person outside
 * the network is reached through their public profile, which carries the same action.
 */
export const NewMessageDialog = ({ onClose, onOpened }: NewMessageDialogProps) => {
  const { t } = useLanguage();
  const [rows, setRows] = useState<readonly NetworkRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchNetworkGroup('connected', null, 50, controller.signal)
      .then((page) => setRows(page.rows))
      .catch(() => setFailed(true));
    return () => controller.abort();
  }, []);

  if (chosen !== null) {
    return (
      <StartMessageDialog
        recipientId={chosen.id}
        recipientName={chosen.name}
        onClose={onClose}
        onOpened={onOpened}
      />
    );
  }

  return (
    <div className="msg-dialog" aria-labelledby="new-message-title">
      <h3 id="new-message-title" className="msg-dialog__title">{t.messaging.newMessage}</h3>
      <p className="msg-dialog__subject">{t.messaging.chooseRecipient}</p>

      {failed ? <p className="msg-dialog__error" role="alert">{t.messaging.recipientsFailure}</p> : null}
      {rows === null && !failed ? <p className="msg-empty">{t.messaging.loading}</p> : null}
      {rows !== null && rows.length === 0 ? (
        <p className="msg-empty">{t.messaging.noConnections}</p>
      ) : null}

      {rows !== null && rows.length > 0 ? (
        <ul className="msg-recipients">
          {rows.map((row) => {
            const name = `${row.person.firstName} ${row.person.lastName}`.trim();
            return (
              <li key={row.person.userId}>
                <button
                  type="button"
                  className="msg-recipients__row"
                  onClick={() => setChosen({ id: row.person.userId, name })}
                >
                  <span dir="auto">{name}</span>
                  {row.person.companyName ? (
                    <span className="msg-recipients__company" dir="auto">
                      {row.person.companyName}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="msg-dialog__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
          {t.messaging.cancel}
        </button>
      </div>
    </div>
  );
};
