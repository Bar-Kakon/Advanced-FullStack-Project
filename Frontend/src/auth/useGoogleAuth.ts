import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { classifyGoogleError, signInWithGoogle, type GoogleFailure } from '../api/google.api';
import { useLanguage } from '../i18n/useLanguage';
import { destinationFor } from './destination';
import { useAuth } from './useAuth';

/**
 * What a Google credential does once the browser has one.
 *
 * The two outcomes land in two different places, and neither is decided here: the server says
 * which it is. A recognised account ends exactly where password login ends — the same session, the
 * same stored identity, the same destination — and a first-time visitor is carried to Register
 * with the verified identity, because Google cannot supply the trade, the business or the location
 * FieldSync needs and nothing here invents them.
 */
export const useGoogleAuth = (from?: string) => {
  const { t, setLang } = useLanguage();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<GoogleFailure | null>(null);

  const submit = useCallback(
    async (credential: string): Promise<void> => {
      setBusy(true);
      setFailure(null);

      try {
        const result = await signInWithGoogle(credential);

        if (result.outcome === 'signed_in') {
          signIn(result);
          // The account preference wins over the pre-login default, exactly as it does on Login.
          setLang(result.user.language);
          navigate(from ?? destinationFor(result.user), { replace: true });
          return;
        }

        // The credential travels in navigation state rather than in the address: an ID token in a
        // URL would be in the history, in the referrer and in any server log along the way.
        navigate('/register', {
          state: { google: { idToken: credential, ...result.profile } },
          replace: true,
        });
      } catch (error) {
        setFailure(classifyGoogleError(error));
      } finally {
        setBusy(false);
      }
    },
    [signIn, setLang, navigate, from],
  );

  const messages = t.login.googleErrors;
  const error =
    failure === 'LINK_REQUIRED' ? messages.linkRequired
    : failure === 'IDENTITY_CLAIMED' ? messages.identityClaimed
    : failure === 'EMAIL_NOT_VERIFIED' ? messages.emailNotVerified
    : failure === 'NOT_CONFIGURED' ? messages.notConfigured
    : failure === 'CREDENTIAL' ? messages.credential
    : failure === 'NETWORK' ? t.login.errors.network
    : failure ? t.login.errors.generic
    : null;

  return { submit, busy, error };
};