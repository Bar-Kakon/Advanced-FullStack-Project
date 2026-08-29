/**
 * The blueprint-board panel beside the form on the auth screens. Presentation only — it holds no
 * state and reads no context, so the two screens that use it can say different things through the
 * same composition.
 *
 * Every bullet a caller passes describes product behaviour and nothing about who may act on a
 * task. These are signed-out surfaces, and the delegation model requires that a confidential
 * capability is never named where someone it is hidden from can read it.
 *
 * There is no "// LABEL" mono eyebrow above the headline. It was removed from register on
 * 2026-06-28 and from login in this migration, both by owner decision, and the standing rule is
 * that the kicker is not reused.
 */
export interface BrandPanelContent {
  readonly beta: string;
  readonly headline: string;
  readonly sub: string;
  readonly featuresLabel: string;
  readonly features: readonly string[];
  readonly footerNote: string;
}

export const BrandPanel = ({ content }: { content: BrandPanelContent }) => (
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
        <span className="brand-logo__badge">{content.beta}</span>
      </div>

      <div className="brand-copy">
        <h1 className="brand-headline">{content.headline}</h1>
        <p className="brand-sub">{content.sub}</p>
      </div>

      <ul className="brand-features" aria-label={content.featuresLabel}>
        {content.features.map((feature) => (
          <li className="brand-feature" key={feature}>
            <span className="brand-feature__mark" aria-hidden="true">＋</span>
            {feature}
          </li>
        ))}
      </ul>

      <p className="brand-footer-note">{content.footerNote}</p>
    </div>
  </aside>
);
