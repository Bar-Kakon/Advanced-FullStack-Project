// Persist the CSS-only language toggle across screens (localStorage).
(function (): void {
  const KEY = 'fieldsync-lang';
  const he = document.getElementById('lang-he') as HTMLInputElement | null;
  const en = document.getElementById('lang-en') as HTMLInputElement | null;
  if (!he || !en) return;

  // The stylesheet already flips the layout, so this only keeps the root attributes truthful for screen readers.
  const syncRoot = (): void => {
    const root = document.documentElement;
    root.lang = en.checked ? 'en' : 'he';
    root.dir = en.checked ? 'ltr' : 'rtl';
  };

  // Apply the saved choice on load; Hebrew stays the default.
  try {
    if (localStorage.getItem(KEY) === 'en') en.checked = true;
  } catch (e) { /* localStorage may be blocked */ }
  syncRoot();

  // Remember the choice whenever it changes.
  const apply = (): void => {
    syncRoot();
    try {
      localStorage.setItem(KEY, en.checked ? 'en' : 'he');
    } catch (e) { /* ignore */ }
  };
  he.addEventListener('change', apply);
  en.addEventListener('change', apply);
})();
