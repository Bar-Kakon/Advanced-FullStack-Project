import { Fragment, useEffect } from 'react';
import { Bidi } from '../../components/Bidi';
import { Link } from 'react-router-dom';

import { LanguageSwitch } from '../../components/LanguageSwitch';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { BrandMark } from './components/BrandMark';
import { ContactForm } from './components/ContactForm';
import { DependencyExample } from './components/DependencyExample';
import landingCss from './landing.css?inline';

const VALUE_ICONS = [
  <>
    <circle cx="8" cy="9" r="3" />
    <circle cx="17" cy="9" r="3" />
    <path d="M2.5 19v-1a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v1" />
    <path d="M14.5 14.2a4 4 0 0 1 3-1.2h1a4 4 0 0 1 4 4V19" />
  </>,
  <>
    <path d="M12 3l7.5 3v5.4c0 4.3-3.1 7.9-7.5 9.1-4.4-1.2-7.5-4.8-7.5-9.1V6z" />
    <path d="M9 12.2l2.1 2.1L15.4 10" />
  </>,
];

const useMetaDescription = (content: string): void => {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = content;
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [content]);
};

const FlowArrow = () => (
  <li className="flow__arrow" aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h13M13 6.5l5.5 5.5L13 17.5" />
    </svg>
  </li>
);

/**
 * The public face of the platform — approved screen #1, and the only screen a visitor reaches
 * with no session at all.
 *
 * It carries its own `.site-nav` rather than the authenticated `AppNav`: there is no notifications
 * bell and no account chip here, because there is no account. Register is the one filled control.
 */
export const LandingPage = () => {
  const { t } = useLanguage();
  const landing = t.landing;
  useScreenStylesheet({ id: 'landing.css', css: landingCss });
  useDocumentTitle(landing.documentTitle);
  useMetaDescription(landing.metaDescription);

  return (
    <div className="app">
      <a href="#main" className="skip-link">{landing.skip}</a>

      <header className="site-nav">
        <div className="site-nav__inner">
          {/* Identity mark only, deliberately not a link: this is the page it would point at. */}
          <div className="site-nav__brand">
            <span className="site-nav__mark" aria-hidden="true"><BrandMark size={26} on="dark" /></span>
            <span className="site-nav__name">Blokta</span>
          </div>

          <div className="site-nav__actions">
            <Link to="/login" className="site-nav__signin">{landing.signIn}</Link>
            {/* Register is the primary public action, so it is the only filled control here. */}
            <Link to="/register" className="btn btn--sm btn--onboard">{landing.createAccount}</Link>
            <LanguageSwitch />
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__text">
            <h1 className="hero__title" id="hero-title" dir="auto">{landing.hero.title}</h1>
            <p className="hero__lede" dir="auto"><Bidi text={landing.hero.lede} /></p>

            <div className="hero__actions">
              <Link to="/register" className="btn btn--onboard hero__cta">{landing.createAccount}</Link>
              <Link to="/login" className="btn btn--outline">{landing.signIn}</Link>
            </div>
          </div>

          <DependencyExample />
        </section>

        <section className="values" aria-labelledby="values-title">
          <h2 className="section-title" id="values-title" dir="auto">{landing.values.title}</h2>

          <ul className="values__grid">
            {landing.values.cards.map((card, index) => (
              <li className="vcard" key={card.title}>
                <span className="vcard__icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {VALUE_ICONS[index]}
                  </svg>
                </span>
                <h3 className="vcard__title" dir="auto">{card.title}</h3>
                <p className="vcard__body" dir="auto">{card.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="flow" aria-labelledby="flow-title">
          <h2 className="section-title" id="flow-title" dir="auto">{landing.flow.title}</h2>

          <ol className="flow__steps">
            {landing.flow.steps.map((step, index) => (
              <Fragment key={step}>
                {index > 0 && <FlowArrow />}
                <li className="flow__step">
                  <span className="flow__num" aria-hidden="true">{index + 1}</span>
                  <span className="flow__label" dir="auto">{step}</span>
                </li>
              </Fragment>
            ))}
          </ol>

          <p className="flow__note" dir="auto">{landing.flow.note}</p>
        </section>

        <section className="direct" aria-labelledby="direct-title">
          <div className="direct__text">
            <h2 className="direct__title" id="direct-title" dir="auto">{landing.direct.title}</h2>
            <p className="direct__lede" dir="auto">{landing.direct.lede}</p>
          </div>
          <div className="direct__actions">
            {/* Tan, not navy: this band sits on the board, and the stylesheet's own rule is that a
                control there is filled in tan so it never reads as blue on blue. */}
            <Link to="/register" className="btn btn--onboard">{landing.direct.cta}</Link>
          </div>
        </section>

        {/* The Contact entry point is the form itself, on this page. The earlier screen reserved a
            separate `contact.html`; that filename is still not a route, and a section here is
            what makes Contact real without inventing one. */}
        <section className="contact" id="contact" aria-labelledby="contact-title">
          <h2 className="section-title" id="contact-title" dir="auto">{landing.contact.title}</h2>
          <p className="contact__lede" dir="auto">{landing.contact.lede}</p>
          <ContactForm />
        </section>
      </main>

      <footer className="site-foot">
        <div className="site-foot__inner">
          <div className="site-foot__brand">
            <span className="site-foot__mark" aria-hidden="true"><BrandMark size={22} on="dark" /></span>
            <span className="site-foot__name">Blokta</span>
          </div>

          {/* The one footer link. Plans and Help stay absent — they have no destination — and
              Contact points at this page's own section rather than a route that does not exist. */}
          <nav className="site-foot__links" aria-label={landing.contact.title}>
            <a href="#contact" className="site-foot__link">{landing.footerContact}</a>
          </nav>

          {/* Stated plainly so the page is never mistaken for a live commercial service. */}
          <p className="site-foot__note" dir="auto"><Bidi text={landing.footerNote} /></p>
        </div>
      </footer>
    </div>
  );
};
