import { useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import type { WorkEntry } from '../../../api/profile.api';

/** Adds one completed-work entry, with the optional picture the backend already accepts. */
export const WorkEntryForm = ({
  onSubmit,
  onCancel,
  busy,
  error,
}: {
  onSubmit: (entry: { title: string; scope?: string; meta: string }, image: File | null) => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) => {
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [meta, setMeta] = useState('');
  const [scope, setScope] = useState('');
  const [image, setImage] = useState<File | null>(null);

  const complete = title.trim() !== '' && meta.trim() !== '';

  return (
    <div className="work-add">
      <div className="form-group">
        <label className="field-label" htmlFor="work-entry-title">{t.editProfile.work.titleLabel}</label>
        <input
          className="form-input" id="work-entry-title" type="text" dir="auto" maxLength={120}
          value={title} onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="field-label" htmlFor="work-entry-meta">{t.editProfile.work.metaLabel}</label>
        <input
          className="form-input" id="work-entry-meta" type="text" dir="auto" maxLength={120}
          placeholder={t.editProfile.work.metaPlaceholder}
          value={meta} onChange={(event) => setMeta(event.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="field-label" htmlFor="work-entry-scope">
          {t.editProfile.work.scopeLabel}
          <span className="field-label__optional">{t.editProfile.optional}</span>
        </label>
        <input
          className="form-input" id="work-entry-scope" type="text" dir="auto" maxLength={160}
          value={scope} onChange={(event) => setScope(event.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="field-label" htmlFor="work-entry-image">
          {t.editProfile.work.imageLabel}
          <span className="field-label__optional">{t.editProfile.optional}</span>
        </label>
        <input
          className="form-input" id="work-entry-image" type="file" accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setImage(event.target.files?.[0] ?? null)}
        />
      </div>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      <div className="work-add__actions">
        <button
          type="button" className="btn btn--primary btn--sm" disabled={!complete || busy}
          aria-busy={busy}
          onClick={() =>
            onSubmit(
              { title: title.trim(), meta: meta.trim(), ...(scope.trim() ? { scope: scope.trim() } : {}) },
              image,
            )
          }
        >
          {busy ? t.editProfile.work.adding : t.editProfile.work.confirmAdd}
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
