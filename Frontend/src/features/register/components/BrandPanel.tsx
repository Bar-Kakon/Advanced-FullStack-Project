import { useLanguage } from '../../../i18n/useLanguage';

/**
 * The blueprint-board panel beside the form. Presentation only — it holds no state and takes no
 * props, reading its copy straight from the language context.
 *
 * Every bullet here describes product behaviour and nothing about who may act on a task. This is
 * a signed-out surface, and the delegation model requires that a confidential capability is never
 * named where someone it is hidden from can read it.
 */
export const BrandPanel = () => {
  const { t } = useLanguage();

  return (
    <aside className="brand-panel">
      <span className="reg-mark reg-mark--tl" aria-hidden="true" />
      <span className="reg-mark reg-mark--br" aria-hidden="true" />
      <span className="crosshair crosshair--a" aria-hidden="true" />
      <span className="crosshair crosshair--b" aria-hidden="true" />

      <div className="brand-panel__inner">
        <div className="brand-logo">
          <span className="brand-logo__mark" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="8" cy="20" r="6" fill="rgba(199,184,157,0.30)" stroke="rgba(255,253,248,0.92)" strokeWidth="2" />
              <circle cx="32" cy="8" r="6" fill="rgba(199,184,157,0.30)" stroke="rgba(255,253,248,0.92)" strokeWidth="2" />
              <circle cx="32" cy="32" r="6" fill="rgba(199,184,157,0.30)" stroke="rgba(255,253,248,0.92)" strokeWidth="2" />
              <line x1="14" y1="17" x2="26" y2="11" stroke="rgba(255,253,248,0.55)" strokeWidth="1.5" strokeDasharray="3 2" />
              <line x1="14" y1="23" x2="26" y2="29" stroke="rgba(255,253,248,0.55)" strokeWidth="1.5" strokeDasharray="3 2" />
              <line x1="32" y1="14" x2="32" y2="26" stroke="rgba(255,253,248,0.40)" strokeWidth="1.5" strokeDasharray="3 2" />
            </svg>
          </span>
          <span className="brand-logo__name">FieldSync</span>
          <span className="brand-logo__badge">{t.brand.beta}</span>
        </div>

        <div className="brand-copy">
          <h1 className="brand-headline">{t.brand.headline}</h1>
          <p className="brand-sub">{t.brand.sub}</p>
        </div>

        <ul className="brand-features" aria-label={t.brand.featuresLabel}>
          {t.brand.features.map((feature) => (
            <li className="brand-feature" key={feature}>
              <span className="brand-feature__mark" aria-hidden="true">＋</span>
              {feature}
            </li>
          ))}
        </ul>

        <p className="brand-footer-note">{t.brand.footerNote}</p>
      </div>
    </aside>
  );
};
