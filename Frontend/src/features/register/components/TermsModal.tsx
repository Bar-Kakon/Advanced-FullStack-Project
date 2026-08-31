import { useEffect, useRef } from 'react';

import { useLanguage } from '../../../i18n/useLanguage';
import { PUBLISHED_TERMS_VERSION } from '../termsDocument';

/**
 * The Terms of Use, read without leaving Register.
 *
 * It holds no registration state of its own and writes none, so opening and closing it cannot
 * disturb a half-filled form — the only thing it changes is whether it is on screen.
 */
export const TermsModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useLanguage();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    // Remembered before focus moves, so closing returns the reader to the control they opened it
    // from rather than to the top of the form.
    opener.current = document.activeElement;
    panel.current?.focus();

    // On the document rather than the dialog: Escape has to work while the panel is being
    // scrolled, and a scrollbar drag leaves focus outside the panel.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="terms-modal" role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <button type="button" className="terms-modal__backdrop" aria-label={t.terms.close} onClick={onClose} />

      {/* tabIndex so the scrollable region is reachable, and focusing it puts the keyboard where
          the content is: a long document has to be scrollable without a mouse. */}
      <div className="terms-modal__panel" ref={panel} tabIndex={-1}>
        <div className="terms-modal__head">
          <h2 id="terms-title" className="terms-modal__title">{t.terms.title}</h2>
          <p className="terms-modal__version">
            {t.terms.version.replace('{version}', PUBLISHED_TERMS_VERSION)}
          </p>
        </div>

        <div className="terms-modal__body">
          {t.terms.sections.map((section) => (
            <section className="terms-modal__section" key={section.heading}>
              <h3 className="terms-modal__heading">{section.heading}</h3>
              <p className="terms-modal__text">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="terms-modal__actions">
          {/* Closing only. Consent is given by the checkbox behind this dialog, so no button here
              can grant it — a reader who closes the document has agreed to nothing yet. */}
          <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>
            {t.terms.done}
          </button>
        </div>
      </div>
    </div>
  );
};
