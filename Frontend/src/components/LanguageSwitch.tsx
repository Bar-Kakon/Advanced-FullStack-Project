import { useLanguage } from '../i18n/useLanguage';

/**
 * The עב / EN pill.
 *
 * The prototype used two hidden radio inputs, because CSS alone can only remember a choice by
 * storing it in a form control. Here the choice lives in the language context, so these are plain
 * buttons — which also means they can be reached by keyboard in the obvious way, and announce
 * which one is currently selected.
 */
export const LanguageSwitch = () => {
  const { lang, t, setLang } = useLanguage();

  const cls = (which: 'he' | 'en') =>
    `lang-switch__btn ${lang === which ? 'lang-switch__btn--active' : 'lang-switch__btn--inactive'}`;

  return (
    <div className="lang-switch" role="group" aria-label={t.langSwitchLabel}>
      <svg className="lang-switch__globe" width="15" height="15" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
      </svg>
      <button type="button" className={cls('he')} aria-pressed={lang === 'he'} onClick={() => setLang('he')}>
        עב
      </button>
      <span className="lang-switch__sep" aria-hidden="true" />
      <button type="button" className={cls('en')} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
        EN
      </button>
    </div>
  );
};
