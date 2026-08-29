import type { ReactNode } from 'react';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

import { useLanguage } from '../../../i18n/useLanguage';
import { WorkPhoto } from './WorkPhoto';
import type { CompletedWorkEntry } from '../profileModel';

export const CompletedWorkPanel = ({
  entries,
  lede,
  manage,
  notice = null,
}: {
  entries: readonly CompletedWorkEntry[];
  lede: string;
  /** Absent on the read view. Present on Edit profile, where the section is editable. */
  manage?: {
    addLabel: string;
    editLabel: string;
    removeLabel: string;
    onAdd: () => void;
    onEdit: (entry: CompletedWorkEntry) => void;
    onRemove: (id: string) => void;
  };
  notice?: ReactNode;
}) => {
  const { t } = useLanguage();

  return (
    <section className="panel panel--work" aria-labelledby="work-title">
      <h2 id="work-title" className="panel__title">{t.profile.work.title}</h2>
      <p className="panel__lede">{lede}</p>
      <ul className="work-grid">
        {entries.map((entry) => (
          <li className="work-item" key={entry.id}>
            {manage ? (
              <div className="work-item__tools">
                <Tooltip title={manage.editLabel}>
                  <IconButton
                    size="small"
                    aria-label={manage.editLabel}
                    onClick={() => manage.onEdit(entry)}
                  >
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={manage.removeLabel}>
                  <IconButton
                    size="small"
                    aria-label={manage.removeLabel}
                    onClick={() => manage.onRemove(entry.id)}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </div>
            ) : null}

            <WorkPhoto url={entry.imageUrl} title={entry.title} />

            <div className="work-item__body">
              <p className="work-item__title" dir="auto">{entry.title}</p>
              {entry.scope ? <p className="work-item__scope" dir="auto">{entry.scope}</p> : null}
              <p className="work-item__meta">{entry.meta}</p>
              {entry.onFieldSync ? (
                <span className="work-badge">
                  <svg className="work-badge__icon" width="15" height="15" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2 20.7 7 20.7 17 12 22 3.3 17 3.3 7Z" strokeWidth="1.7" />
                    <path d="M8.4 12.2 10.9 14.7 15.6 9.6" strokeWidth="2.1" />
                  </svg>
                  {t.profile.work.badge}
                </span>
              ) : null}
            </div>
          </li>
        ))}
        {manage ? (
          <li>
            <button type="button" className="work-add" onClick={manage.onAdd}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {manage.addLabel}
            </button>
          </li>
        ) : null}
      </ul>
      {notice}
    </section>
  );
};