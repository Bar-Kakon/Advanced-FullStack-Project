"use strict";
const registerForm = document.querySelector(".register-form");
if (registerForm) {
    const fields = registerForm.querySelectorAll(".form-input, .form-select, .checkbox-input");
    fields.forEach((field) => {
        const markTouched = () => field.classList.add("touched");
        field.addEventListener("blur", markTouched);
        field.addEventListener("change", markTouched);
    });
}
