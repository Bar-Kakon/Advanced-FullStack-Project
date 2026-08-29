import { Link } from 'react-router-dom';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';

/**
 * The confirmation both screens land on. Its wording is the security posture: it says *if* an
 * account exists, never that one does — and the server backs that up by answering identically
 * whatever address was sent.
 */
export const ResetLinkSent = ({
  onResend,
  resending,
}: {
  onResend: () => void;
  resending: boolean;
}) => {
  const { t } = useLanguage();

  return (
    <section className="auth-step auth-step--current auth-step--center" aria-label={t.forgotPassword.sentTitle}>
      <span className="status-badge" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M3.5 7l8.5 6 8.5-6" />
        </svg>
      </span>

      <header className="form-header">
        <h2 className="form-title">{t.forgotPassword.sentTitle}</h2>
        <p className="form-subtitle">{t.forgotPassword.sentSubtitle}</p>
      </header>

      <Link to="/login" className="btn btn--primary btn--full">{t.forgotPassword.backButton}</Link>

      <p className="form-footer">
        {t.forgotPassword.noMail}{' '}
        {/* A real second request, which retires the first link server-side. */}
        <button
          type="button"
          className="form-link form-link--strong"
          disabled={resending}
          aria-busy={resending}
          onClick={onResend}
        >
          {t.forgotPassword.resend}
          {resending ? <ButtonSpinner /> : null}
        </button>
      </p>
    </section>
  );
};
