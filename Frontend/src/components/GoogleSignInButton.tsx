import { useEffect, useRef, useState } from 'react';

import { googleClientId, loadGoogleIdentity } from '../auth/googleIdentity';
import { useLanguage } from '../i18n/useLanguage';

/**
 * Google's own button, rendered by Google's script.
 *
 * It is not styled as a FieldSync control on purpose: Google's branding guidelines govern how a
 * "Sign in with Google" affordance may look, and a hand-drawn imitation would be both a guideline
 * breach and a control whose behaviour we would then have to reproduce. Everything around it — the
 * divider, the spacing, the error region — is the product's own design system.
 *
 * With no client id configured nothing is rendered at all. A button that cannot work is worse than
 * no button, and email and password sign-in are unaffected either way.
 */
export const GoogleSignInButton = ({
  onCredential,
  text,
  disabled = false,
}: {
  onCredential: (credential: string) => void;
  text: 'continue_with' | 'signup_with';
  disabled?: boolean;
}) => {
  const { lang } = useLanguage();
  const host = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  // The callback is read through a ref, so a re-render with a new handler does not force the
  // button to be initialised again.
  const handler = useRef(onCredential);
  handler.current = onCredential;

  useEffect(() => {
    const parent = host.current;
    if (parent === null) return;

    // Google's button takes a pixel width, so it is measured rather than given a percentage.
    setWidth(Math.round(parent.getBoundingClientRect().width));
  }, []);

  useEffect(() => {
    const parent = host.current;
    const clientId = googleClientId();
    if (parent === null || clientId === undefined || width === 0) return;

    let cancelled = false;

    void loadGoogleIdentity().then((api) => {
      if (api === null || cancelled) return;

      api.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential !== undefined) handler.current(response.credential);
        },
        // Never signs somebody in without them asking. A returning visitor still presses the
        // button, which is the only place this flow may start.
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      parent.replaceChildren();
      api.renderButton(parent, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text,
        logo_alignment: 'center',
        locale: lang === 'he' ? 'he' : 'en',
        width,
      });
    });

    return () => {
      cancelled = true;
    };
    // Re-rendered on a language change so the button's own label follows the interface.
  }, [lang, text, width]);

  if (googleClientId() === undefined) return null;

  return (
    <div
      className={`google-signin${disabled ? ' google-signin--busy' : ''}`}
      // Google renders its own focusable button inside. While a request is in flight the region is
      // taken out of the tab order rather than left clickable a second time.
      {...(disabled ? { 'aria-busy': true, inert: true } : {})}
    >
      <div ref={host} className="google-signin__host" />
    </div>
  );
};