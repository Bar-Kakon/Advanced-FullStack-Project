import { LanguageProvider } from './i18n/LanguageContext';
import { RegisterPage } from './features/register/RegisterPage';

/**
 * The app root.
 *
 * `LanguageProvider` wraps everything so any component, at any depth, can read the current
 * language without it being handed down through every component in between.
 *
 * There is no router yet, and deliberately so: Register is the only migrated screen, and the
 * profile wizard is part of the Register flow rather than a separate destination. A router arrives
 * with the second screen, when there is something to route between.
 */
export const App = () => (
  <LanguageProvider>
    <RegisterPage />
  </LanguageProvider>
);
