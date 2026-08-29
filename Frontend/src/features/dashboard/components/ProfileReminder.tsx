import { Link } from 'react-router-dom';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import type { ProfileReminder as ProfileReminderData } from '../../../api/dashboard.types';

export interface ProfileReminderProps {
  readonly reminder: ProfileReminderData;
  readonly dismissing: boolean;
  readonly onDismiss: () => void;
}

export const ProfileReminder = ({ reminder, dismissing, onDismiss }: ProfileReminderProps) => {
  const { t } = useLanguage();
  if (!reminder.visible) return null;

  const required = reminder.missing.filter((item) => item.importance === 'required');
  const suggested = reminder.missing.filter((item) => item.importance === 'suggested');

  const list = (items: typeof reminder.missing, badge: string, tone: string) =>
    items.length === 0 ? null : (
      <ul className={`reminder__list reminder__list--${tone}`}>
        {items.map((item) => (
          <li key={item.key} className="reminder__item">
            <span className={`reminder__badge reminder__badge--${tone}`}>{badge}</span>
            <span className="reminder__item-name">{t.dashboard.reminder.items[item.key]}</span>
          </li>
        ))}
      </ul>
    );

  return (
    <section className="panel reminder" aria-labelledby="profile-reminder-title">
      <div className="reminder__head">
        <div className="reminder__head-text">
          <h2 id="profile-reminder-title" className="panel__title">{t.dashboard.reminder.title}</h2>
          <p className="panel__lede">{t.dashboard.reminder.lede}</p>
        </div>

        <button
          type="button"
          className="btn btn--quiet btn--sm"
          onClick={onDismiss}
          disabled={dismissing}
        >
          {t.dashboard.reminder.dismiss}
          {dismissing ? <ButtonSpinner /> : null}
        </button>
      </div>

      {list(required, t.dashboard.reminder.required, 'required')}
      {list(suggested, t.dashboard.reminder.suggested, 'suggested')}

      <Link to="/profile/edit" className="btn btn--primary btn--sm reminder__cta">
        {t.dashboard.reminder.edit}
      </Link>
    </section>
  );
};
