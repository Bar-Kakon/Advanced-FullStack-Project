import { useRef, useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { FieldLabel } from '../../../components/FieldLabel';
import { useLanguage } from '../../../i18n/useLanguage';
import { uploadAttachment } from '../../../api/messaging.api';
import type { MessageAttachment } from '../../../api/messaging.types';

export interface AgreementProposalDialogProps {
  readonly conversationId: string;
  readonly busyExternally: boolean;
  readonly onClose: () => void;
  readonly onPropose: (input: {
    title: string;
    description?: string;
    startDate: string;
    dueDate: string;
    attachments?: readonly string[];
  }) => Promise<void>;
}

/**
 * The agreement proposal, inside the conversation it belongs to. The fields are the Create Task
 * fields, because acceptance creates the canonical Task — there is no second agreement system.
 */
export const AgreementProposalDialog = ({
  conversationId,
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
  const [attachments, setAttachments] = useState<readonly MessageAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachFailed, setAttachFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const attach = async (file: File): Promise<void> => {
    setUploading(true);
    setAttachFailed(false);
    try {
      const uploaded = await uploadAttachment(conversationId, file);
      setAttachments((previous) => [...previous, uploaded]);
    } catch {
      setAttachFailed(true);
    } finally {
      setUploading(false);
    }
  };

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
        ...(attachments.length === 0 ? {} : { attachments: attachments.map((a) => a.id) }),
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

      <div className="msg-dialog__field">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file !== undefined) void attach(file);
          }}
        />
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => fileInput.current?.click()}
          disabled={uploading || busy}
        >
          {t.messaging.attach}
          {uploading ? <ButtonSpinner /> : null}
        </button>
        {attachFailed ? (
          <p className="msg-dialog__error" role="alert">{t.messaging.attachFailed}</p>
        ) : null}
        {attachments.map((attachment) => (
          <span key={attachment.id} className="msg-attachment__file">
            <span className="msg-attachment__name" dir="ltr">{attachment.filename}</span>
            <button
              type="button"
              className="msg-bubble__report"
              onClick={() =>
                setAttachments((previous) => previous.filter((row) => row.id !== attachment.id))
              }
            >
              {t.messaging.attachRemove}
            </button>
          </span>
        ))}
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
