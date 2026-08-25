// Persist the CSS-only language toggle across screens (localStorage).
(function (): void {
  const KEY = 'fieldsync-lang';
  const he = document.getElementById('lang-he') as HTMLInputElement | null;
  const en = document.getElementById('lang-en') as HTMLInputElement | null;
  if (!he || !en) return;

  // Apply the saved choice on load; Hebrew stays the default.
  try {
    if (localStorage.getItem(KEY) === 'en') en.checked = true;
  } catch (e) { /* localStorage may be blocked */ }

  // Remember the choice whenever it changes.
  const save = (): void => {
    try {
      localStorage.setItem(KEY, en.checked ? 'en' : 'he');
    } catch (e) { /* ignore */ }
  };
  he.addEventListener('change', save);
  en.addEventListener('change', save);
})();
