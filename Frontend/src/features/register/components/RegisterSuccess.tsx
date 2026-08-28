import type { AuthenticatedUser } from '../../../api/types';
import { useLanguage } from '../../../i18n/useLanguage';

/**
 * What replaces the form once the account exists.
 *
 * Deliberately not a new screen. Where Register goes after this is an open decision (D30) — the
 * profile wizard is part of the Register flow rather than a place to navigate to, and no endpoint
 * exists to save wizard answers to yet. So this states what happened, in the language on screen,
 * using only classes the stylesheet already has, and invents no destination.
 */
export const RegisterSuccess = ({ user, companyName }: { user: AuthenticatedUser; companyName: string }) => {
  const { t } = useLanguage();

  const body = t.success.body
    .replace('{name}', user.firstName)
    .replace('{company}', companyName);

  return (
    <>
      <header className="form-header">
        <h2 className="form-title">{t.success.title}</h2>
        <p className="form-subtitle">{body}</p>
      </header>
      <p className="field-hint">{t.success.next}</p>
    </>
  );
};
