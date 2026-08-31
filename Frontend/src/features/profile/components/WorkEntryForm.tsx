import { useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import type { WorkEntry } from '../../../api/profile.api';

export interface WorkEntryValues {
  title: string;
  scope: string;
  meta: string;
}

/** Adds one completed-work entry, or edits one that is already saved. */
export const WorkEntryForm = ({
  entry,
  onSubmit,
  onCancel,
  busy,
  error,
}: {
  /** The saved entry being edited, or `null` when this is a new one. */
  entry: WorkEntry | null;
  onSubmit: (values: WorkEntryValues, image: File | null) => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) => {
  const { t } = useLanguage();
  const [title, setTitle] = useState(entry?.title ?? '');
  const [meta, setMeta] = useState(entry?.meta ?? '');
  const [scope, setScope] = useState(entry?.scope ?? '');
  const [image, setImage] = useState<File | null>(null);

  const editing = entry !== null;
  const complete = title.trim() !== '' && meta.trim() !== '';
  const field = (name: string): string => `work-entry-${name}`;

  return (
    <div className="work-add">
      {editing ? <h3 className="work-add__title">{t.editProfile.work.editTitle}</h3> : null}

      <div className="form-group">
        <label className="field-label" htmlFor={field('title')}>{t.editProfile.work.titleLabel}</label>
        <input
          className="form-input" id={field('title')} type="text" dir="auto" maxLength={120}
          value={title} onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="field-label" htmlFor={field('meta')}>{t.editProfile.work.metaLabel}</label>
        <input
          className="form-input" id={field('meta')} type="text" dir="auto" maxLength={120}
          placeholder={t.editProfile.work.metaPlaceholder}
          value={meta} onChange={(event) => setMeta(event.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="field-label" htmlFor={field('scope')}>
          {t.editProfile.work.scopeLabel}
          <span className="field-label__optional">{t.editProfile.optional}</span>
        </label>
        <input
          className="form-input" id={field('scope')} type="text" dir="auto" maxLength={160}
          value={scope} onChange={(event) => setScope(event.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="field-label" htmlFor={field('image')}>
          {editing && entry.imageUrl ? t.editProfile.work.imageReplaceLabel : t.editProfile.work.imageLabel}
          <span className="field-label__optional">{t.editProfile.optional}</span>
        </label>
        <input
          className="form-input" id={field('image')} type="file" accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setImage(event.target.files?.[0] ?? null)}
        />
        {editing && entry.imageUrl ? (
          <p className="field-hint">{t.editProfile.work.imageCurrent}</p>
        ) : null}
      </div>

      {error ? <p className="field-error field-error--visible" role="alert">{error}</p> : null}

      <div className="work-add__actions">
        <button
          type="button" className="btn btn--primary btn--sm" disabled={!complete || busy}
          aria-busy={busy}
          onClick={() => onSubmit({ title: title.trim(), meta: meta.trim(), scope: scope.trim() }, image)}
        >
          {editing ? t.editProfile.work.confirmEdit : t.editProfile.work.confirmAdd}
          {busy ? <ButtonSpinner /> : null}
        </button>
        <button type="button" className="btn btn--quiet btn--sm" onClick={onCancel}>
          {t.editProfile.actions.cancel}
        </button>
      </div>
    </div>
  );
};

export type { WorkEntry };