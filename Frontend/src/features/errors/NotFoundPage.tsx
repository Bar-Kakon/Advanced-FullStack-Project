import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { LanguageSwitch } from '../../components/LanguageSwitch';
import { destinationFor } from '../../auth/destination';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import errorCss from './error.css?inline';

/** The earlier screen carried `<meta name="robots" content="noindex">`; a single-page app has to add it. */
const useNoIndex = (): void => {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
};

/**
 * Approved screen #28, and where every unmatched address now lands.
 *
 * The copy is deliberately neutral: it never says whether the thing asked for never existed, was
 * removed, or is simply not this viewer's to see. That is the same stance the backend takes under
 * D16, and it only holds if both ends keep it — so nothing here renders the address that failed,
 * the viewer's authorization state, or any other detail of what went wrong.
 *
 * There is no `AppNav`, because an unmatched address is reachable signed out and an authenticated
 * navbar would be wrong for half the people who see it.
 */
export const NotFoundPage = () => {
  const { t } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const notFound = t.notFound;
  useScreenStylesheet({ id: 'error.css', css: errorCss });
  useDocumentTitle(notFound.documentTitle);
  useNoIndex();

  // One recovery action and one label. Home is the public Landing for a visitor with no session,
  // and the address that session resolves to for everybody else.
  const home = isAuthenticated ? destinationFor(user) : '/';

  return (
    <div className="app">
      <LanguageSwitch />

      <main className="err">
        <section className="err__card">
          <span className="reg-mark reg-mark--tl" aria-hidden="true" />
          <span className="reg-mark reg-mark--br" aria-hidden="true" />
          <span className="crosshair crosshair--a" aria-hidden="true" />
          <span className="crosshair crosshair--b" aria-hidden="true" />

          {/* Identity mark only, deliberately not a link: the screen has exactly one recovery action. */}
          <div className="err__brand">
            <span className="err__brand-mark" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
                <circle cx="8" cy="20" r="6" fill="rgba(199,184,157,0.30)" stroke="rgba(35,56,77,0.92)" strokeWidth="2" />
                <circle cx="32" cy="8" r="6" fill="rgba(199,184,157,0.30)" stroke="rgba(35,56,77,0.92)" strokeWidth="2" />
                <circle cx="32" cy="32" r="6" fill="rgba(199,184,157,0.30)" stroke="rgba(35,56,77,0.92)" strokeWidth="2" />
                <line x1="14" y1="17" x2="26" y2="11" stroke="rgba(35,56,77,0.55)" strokeWidth="1.5" strokeDasharray="3 2" />
                <line x1="14" y1="23" x2="26" y2="29" stroke="rgba(35,56,77,0.55)" strokeWidth="1.5" strokeDasharray="3 2" />
                <line x1="32" y1="14" x2="32" y2="26" stroke="rgba(35,56,77,0.40)" strokeWidth="1.5" strokeDasharray="3 2" />
              </svg>
            </span>
            <span className="err__brand-name">Blokta</span>
          </div>

          {/* Digits are weak-directional; <bdi> keeps the numeral LTR inside the Hebrew layout. */}
          <p className="err__code"><bdi>{notFound.code}</bdi></p>

          <h1 className="err__title" dir="auto">{notFound.title}</h1>
          <p className="err__lede" dir="auto">{notFound.lede}</p>

          <div className="err__reasons">
            <h2 className="err__reasons-title" dir="auto">{notFound.reasonsTitle}</h2>
            {/* None of these confirms whether the content exists or who may see it. */}
            <ul className="err__reasons-list">
              {notFound.reasons.map((reason) => <li key={reason} dir="auto">{reason}</li>)}
            </ul>
          </div>

          <Link to={home} className="btn btn--primary err__cta">{notFound.ctaHome}</Link>
        </section>
      </main>
    </div>
  );
};
