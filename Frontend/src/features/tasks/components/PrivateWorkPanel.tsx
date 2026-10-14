import { useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import type { PrivateItemKind, PrivateWorkItem } from '../../../api/taskDetail.types';

export interface PrivateWorkPanelProps {
  readonly items: readonly PrivateWorkItem[];
  readonly busy: boolean;
  readonly onAdd: (kind: PrivateItemKind, body: string) => void;
  readonly onToggle: (itemId: string, done: boolean) => void;
  readonly onEdit: (itemId: string, body: string) => void;
  readonly onRemove: (itemId: string) => void;
}

/**
 * How the performer organises their own work — sub-tasks and notes nobody else can read.
 *
 * A tick here is a checklist tick and nothing more: the public state of the task is set by Start
 * and Complete alone, so private progress can never leak the method upward through a status.
 */
export const PrivateWorkPanel = ({ items, busy, onAdd, onToggle, onEdit, onRemove }: PrivateWorkPanelProps) => {
  const { t, lang } = useLanguage();
  const copy = t.tasks.detail.privateWork;

  const [kind, setKind] = useState<PrivateItemKind>('subtask');
  const [body, setBody] = useState('');
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  return (
    <section className="panel" aria-labelledby="private-title">
      <h2 id="private-title" className="panel__title">{copy.title}</h2>
      <p className="panel__lede">{copy.lede}</p>

      {items.length === 0 ? (
        <p className="panel__lede">{copy.none}</p>
      ) : (
        <ul className="private-list">
          {items.map((item) => (
            <li key={item._id} className="private-item">
              <div className="private-item__row">
                {item.kind === 'subtask' ? (
                  <label className="perm-check">
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={busy}
                      onChange={() => onToggle(item._id, !item.done)}
                    />
                    <span dir="auto">{item.body}</span>
                  </label>
                ) : (
                  <span className="private-item__note" dir="auto">{item.body}</span>
                )}
                <button
                  type="button"
                  className="btn btn--quiet btn--sm"
                  aria-expanded={openItem === item._id}
                  onClick={() => {
                    setOpenItem(openItem === item._id ? null : item._id);
                    setDraft(item.body);
                  }}
                >
                  {openItem === item._id ? copy.closeDetail : copy.openDetail}
                </button>
                <button
                  type="button"
                  className="btn btn--quiet btn--sm"
                  disabled={busy}
                  onClick={() => onRemove(item._id)}
                >
                  {copy.remove}
                </button>
              </div>

              {openItem === item._id ? (
                <div className="private-item__detail">
                  <p className="dash-note">
                    {(item.kind === 'subtask' ? copy.subtask : copy.note)}
                    {' · '}
                    {copy.createdAt.replace(
                      '{date}',
                      new Date(item.createdAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB'),
                    )}
                    {item.kind === 'subtask' ? ` · ${item.done ? copy.stateDone : copy.stateOpen}` : ''}
                  </p>
                  <div className="form-group">
                    <label className="field-label" htmlFor={`private-edit-${item._id}`}>{copy.editLabel}</label>
                    <input
                      id={`private-edit-${item._id}`}
                      className="form-input"
                      type="text"
                      dir="auto"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                  </div>
                  <div className="private-item__actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={busy || draft.trim().length === 0 || draft.trim() === item.body}
                      onClick={() => {
                        onEdit(item._id, draft.trim());
                        setOpenItem(null);
                      }}
                    >
                      {copy.saveEdit}
                      {busy ? <ButtonSpinner /> : null}
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="dash-note">{copy.noEffect}</p>

      <div className="private-add">
        <div className="form-group">
          <label className="field-label" htmlFor="private-kind">{copy.addLabel}</label>
          <select
            id="private-kind"
            className="form-select"
            value={kind}
            onChange={(e) => setKind(e.target.value as PrivateItemKind)}
          >
            <option value="subtask">{copy.subtask}</option>
            <option value="note">{copy.note}</option>
          </select>
        </div>

        <div className="form-group">
          <label className="field-label" htmlFor="private-body">{copy.addPlaceholder}</label>
          <input
            id="private-body"
            className="form-input"
            type="text"
            dir="auto"
            placeholder={copy.addPlaceholder}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={busy || body.trim().length === 0}
          onClick={() => {
            onAdd(kind, body.trim());
            setBody('');
          }}
        >
          {copy.add}
          {busy ? <ButtonSpinner /> : null}
        </button>
      </div>
    </section>
  );
};
