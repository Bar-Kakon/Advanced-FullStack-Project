import type { ReactNode } from 'react';

import { BrandPanel, type BrandPanelContent } from './BrandPanel';
import { LanguageSwitch } from './LanguageSwitch';

/**
 * The frame every signed-out auth screen sits in: the language pill, the two-column split, the
 * blueprint brand panel, and the cream card the form lives in.
 *
 * Four screens share it — Login, Register, Forgot password and Reset password — which is exactly
 * the duplication the static prototypes could not avoid: they were four documents, so the shell
 * was copied four times and could drift four ways. Here the shell exists once and each screen
 * supplies only what is different: its brand copy, and what goes in the card.
 */
export const AuthShell = ({ brand, children }: { brand: BrandPanelContent; children: ReactNode }) => (
  <>
    <LanguageSwitch />

    <div className="auth-layout">
      <BrandPanel content={brand} />

      <main className="form-panel">
        <div className="form-card">
          <div className="mobile-logo" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
              <circle cx="8" cy="20" r="6" fill="rgba(35,56,77,0.15)" stroke="#23384D" strokeWidth="2" />
              <circle cx="32" cy="8" r="6" fill="rgba(35,56,77,0.15)" stroke="#23384D" strokeWidth="2" />
              <circle cx="32" cy="32" r="6" fill="rgba(35,56,77,0.15)" stroke="#23384D" strokeWidth="2" />
              <line x1="14" y1="17" x2="26" y2="11" stroke="#23384D" strokeWidth="1.5" strokeDasharray="3 2" />
              <line x1="14" y1="23" x2="26" y2="29" stroke="#23384D" strokeWidth="1.5" strokeDasharray="3 2" />
              <line x1="32" y1="14" x2="32" y2="26" stroke="#23384D" strokeWidth="1.5" strokeDasharray="3 2" />
            </svg>
            <span className="mobile-logo__name">Blokta</span>
          </div>

          {children}
        </div>
      </main>
    </div>
  </>
);
