"use strict";
(function () {
    const fields = document.querySelectorAll('.form-input');
    fields.forEach((field) => {
        field.addEventListener('blur', () => {
            field.classList.add('touched');
        });
    });
})();
