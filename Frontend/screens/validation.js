"use strict";
(function () {
    const fields = document.querySelectorAll('.form-input, .form-select, .checkbox-input');
    fields.forEach((field) => {
        const markTouched = () => field.classList.add('touched');
        field.addEventListener('blur', markTouched);
        field.addEventListener('change', markTouched);
    });
})();
