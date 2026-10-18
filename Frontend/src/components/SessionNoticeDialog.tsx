import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';
import { useScreenStylesheet } from '../styles/useScreenStylesheet';
import { ButtonSpinner } from './ButtonSpinner';
import css from './session-notice.css?inline';

export const SessionNoticeDialog = () => {
  const { sessionNotice, acknowledgeSessionNotice } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  useScreenStylesheet({ id: 'session-notice.css', css });

  if (sessionNotice === null) return null;

  const copy = t.sessionNotice.passwordChanged;

  const proceed = async (): Promise<void> => {
    setLeaving(true);
    await acknowledgeSessionNotice();
    setLeaving(false);
    navigate('/login', { replace: true });
  };

  return (
    <div className="session-notice__overlay" role="presentation">
      <div
        className="session-notice"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-notice-title"
        aria-describedby="session-notice-body"
      >
        <h2 className="session-notice__title" id="session-notice-title">{copy.title}</h2>
        <p className="session-notice__body" id="session-notice-body">{copy.body}</p>
        <button
          type="button"
          className="session-notice__action"
          disabled={leaving}
          aria-busy={leaving}
          autoFocus
          onClick={() => void proceed()}
        >
          {copy.continue}
          {leaving ? <ButtonSpinner /> : null}
        </button>
      </div>
    </div>
  );
};
