"use strict";
(function () {
    const KEY = 'fieldsync-lang';
    const he = document.getElementById('lang-he');
    const en = document.getElementById('lang-en');
    if (!he || !en)
        return;
    try {
        if (localStorage.getItem(KEY) === 'en')
            en.checked = true;
    }
    catch (e) { }
    const save = () => {
        try {
            localStorage.setItem(KEY, en.checked ? 'en' : 'he');
        }
        catch (e) { }
    };
    he.addEventListener('change', save);
    en.addEventListener('change', save);
})();
