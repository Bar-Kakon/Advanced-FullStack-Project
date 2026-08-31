import { useState } from 'react';

import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FieldLabel } from '../../components/FieldLabel';
import { useLanguage } from '../../i18n/useLanguage';
import { classifySubmitReportError, submitUserReport } from '../../api/reports.api';
import { REPORT_REASONS, type ReportReason, type SubmitReportFailure } from '../../api/reports.types';

export interface ReportDialogProps {
  readonly subjectUserId: string;
  readonly subjectName: string;
  readonly onClose: () => void;
}

/**
 * The report form, reached from the public profile.
 *
 * It shows a reason list and an optional explanation, and after a successful submission it shows a
 * neutral acknowledgement — never a status, never an outcome, and never a promise about what will
 * happen next. The server tells it nothing else, so there is nothing else it could show.
 */
export const ReportDialog = ({ subjectUserId, subjectName, onClose }: ReportDialogProps) => {
  const { t } = useLanguage();

  const [reason, setReason] = useState<ReportReason | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SubmitReportFailure | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const message =
    failure === 'CANNOT_REPORT_SELF' ? t.reports.errors.self
      : failure === 'DUPLICATE_OPEN_REPORT' ? t.reports.errors.duplicate
        : failure === 'TOO_MANY_REQUESTS' ? t.reports.errors.rateLimited
          : failure === 'NOT_FOUND' ? t.reports.errors.notFound
            : failure === 'NETWORK' ? t.reports.errors.network
              : t.reports.errors.unknown;

  const send = async (): Promise<void> => {
    if (reason === '') return;

    setBusy(true);
    setFailure(null);
    try {
      await submitUserReport(subjectUserId, {
        reason,
        ...(note.trim() ? { note: note.trim() } : {}),
        source: 'public_profile',
      });
      setSubmitted(true);
    } catch (error) {
      setFailure(classifySubmitReportError(error));
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="report-dialog" role="alertdialog" aria-labelledby="report-done-title">
        <h3 id="report-done-title" className="report-dialog__title">{t.reports.submittedTitle}</h3>
        <p className="report-dialog__body">{t.reports.submitted}</p>
        <p className="report-dialog__hint">{t.reports.submittedNote}</p>

        <div className="report-dialog__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>
            {t.reports.close}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="report-dialog"
      aria-labelledby="report-title"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <h3 id="report-title" className="report-dialog__title">{t.reports.dialogTitle}</h3>
      {/* The name is user-generated, so it gets its own direction rather than the form's. */}
      <p className="report-dialog__subject" dir="auto">{subjectName}</p>
      <p className="report-dialog__body">{t.reports.dialogLede}</p>

      {failure ? <p className="report-dialog__error" role="alert">{message}</p> : null}

      <div className="report-dialog__field">
        <FieldLabel htmlFor="report-reason" text={t.reports.reasonLabel} />
        <select
          id="report-reason"
          className="form-input"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value as ReportReason)}
        >
          <option value="" disabled>{t.reports.reasonPlaceholder}</option>
          {REPORT_REASONS.map((code) => (
            <option key={code} value={code}>{t.reports.reasons[code]}</option>
          ))}
        </select>
      </div>

      <div className="report-dialog__field">
        <FieldLabel htmlFor="report-note" text={t.reports.noteLabel} />
        <textarea
          id="report-note"
          className="form-input report-dialog__note"
          dir="auto"
          rows={4}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <p className="report-dialog__hint">{t.reports.noteHint}</p>
      </div>

      <div className="report-dialog__actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy || reason === ''}>
          {t.reports.submit}
          {busy ? <ButtonSpinner /> : null}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
          {t.reports.cancel}
        </button>
      </div>
    </form>
  );
};