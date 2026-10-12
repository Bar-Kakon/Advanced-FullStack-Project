import { useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { FieldLabel } from '../../../components/FieldLabel';
import { useLanguage } from '../../../i18n/useLanguage';

export interface AgreementProposalDialogProps {
  readonly busyExternally: boolean;
  readonly onClose: () => void;
  readonly onPropose: (input: {
    title: string;
    description?: string;
    startDate: string;
    dueDate: string;
  }) => Promise<void>;
}

/**
 * The agreement proposal, inside the conversation it belongs to. The fields are the Create Task
 * fields, because acceptance creates the canonical Task — there is no second agreement system.
 */
export const AgreementProposalDialog = ({
  busyExternally,
  onClose,
  onPropose,
}: AgreementProposalDialogProps) => {
  const { t } = useLanguage();
  const copy = t.messaging.agreementForm;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const complete = title.trim().length > 0 && startDate !== '' && dueDate !== '';

  const submit = async (): Promise<void> => {
    if (!complete) return;

    setBusy(true);
    setFailed(false);
    try {
      await onPropose({
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        startDate,
        dueDate,
      });
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="msg-dialog"
      aria-labelledby="agreement-form-title"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3 id="agreement-form-title" className="msg-dialog__title">{copy.title}</h3>

      {failed ? <p className="msg-dialog__error" role="alert">{copy.failed}</p> : null}

      <div className="msg-dialog__field">
        <FieldLabel htmlFor="agreement-title" text={copy.titleLabel} />
        <input
          id="agreement-title"
          className="form-input"
          dir="auto"
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="msg-dialog__field">
        <FieldLabel htmlFor="agreement-description" text={copy.descriptionLabel} />
        <textarea
          id="agreement-description"
          className="form-input"
          dir="auto"
          rows={3}
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="msg-dialog__dates">
        <div className="msg-dialog__field">
          <FieldLabel htmlFor="agreement-start" text={copy.startLabel} />
          <input
            id="agreement-start"
            className="form-input"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="msg-dialog__field">
          <FieldLabel htmlFor="agreement-due" text={copy.dueLabel} />
          <input
            id="agreement-due"
            className="form-input"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>
      </div>

      <div className="msg-dialog__actions">
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={busy || busyExternally || !complete}
        >
          {copy.submit}
          {busy ? <ButtonSpinner /> : null}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} disabled={busy}>
          {t.messaging.cancel}
        </button>
      </div>
    </form>
  );
};
