"use strict";
(function () {
    const KEY = 'fieldsync-lang';
    const he = document.getElementById('lang-he');
    const en = document.getElementById('lang-en');
    if (!he || !en)
        return;
    const syncRoot = () => {
        const root = document.documentElement;
        root.lang = en.checked ? 'en' : 'he';
        root.dir = en.checked ? 'ltr' : 'rtl';
    };
    try {
        if (localStorage.getItem(KEY) === 'en')
            en.checked = true;
    }
    catch (e) { }
    syncRoot();
    const apply = () => {
        syncRoot();
        try {
            localStorage.setItem(KEY, en.checked ? 'en' : 'he');
        }
        catch (e) { }
    };
    he.addEventListener('change', apply);
    en.addEventListener('change', apply);
})();
