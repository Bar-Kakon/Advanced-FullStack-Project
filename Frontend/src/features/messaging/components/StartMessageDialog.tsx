import { useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import { classifyStartDirectError, startDirect } from '../../../api/messaging.api';
import type { StartDirectFailure } from '../../../api/messaging.types';

export interface StartMessageDialogProps {
  readonly recipientId: string;
  readonly recipientName: string;
  readonly onClose: () => void;
  /** The conversation is open on the server; the caller decides where to navigate. */
  readonly onOpened: (conversationId: string) => void;
}

/**
 * The first message to a person. The server opens the conversation or finds the existing one —
 * the same pair never gets a second thread — and a first contact lands as a message request.
 */
export const StartMessageDialog = ({
  recipientId,
  recipientName,
  onClose,
  onOpened,
}: StartMessageDialogProps) => {
  const { t } = useLanguage();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<StartDirectFailure | null>(null);

  const errors = t.messaging.startErrors;
  const message =
    failure === 'SELF' ? errors.self
      : failure === 'NO_CONTACT' ? errors.noContact
        : failure === 'AWAITING' ? errors.awaiting
          : failure === 'NOT_FOUND' ? errors.notFound
            : failure === 'NETWORK' ? errors.network
              : errors.unknown;

  const send = async (): Promise<void> => {
    const trimmed = body.trim();
    if (trimmed.length === 0) return;

    setBusy(true);
    setFailure(null);
    try {
      const conversation = await startDirect(recipientId, trimmed);
      onOpened(conversation.id);
    } catch (error) {
      setFailure(classifyStartDirectError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="msg-dialog"
      aria-labelledby="start-message-title"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <h3 id="start-message-title" className="msg-dialog__title">{t.messaging.newMessage}</h3>
      <p className="msg-dialog__subject" dir="auto">{recipientName}</p>

      {failure ? <p className="msg-dialog__error" role="alert">{message}</p> : null}

      <textarea
        className="msg-composer__input msg-dialog__input"
        rows={3}
        dir="auto"
        maxLength={4000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t.messaging.composerPlaceholder}
        aria-label={t.messaging.composerPlaceholder}
      />

      <div className="msg-dialog__actions">
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={busy || body.trim().length === 0}
        >
          {t.messaging.send}
          {busy ? <ButtonSpinner /> : null}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} disabled={busy}>
          {t.messaging.cancel}
        </button>
      </div>
    </form>
  );
};
