// register.ts — marks a field "touched" on blur so CSS reds only the fields the
// user actually left empty/invalid (not the whole form). Compiles to register.js.

type ValidatableField = HTMLInputElement | HTMLSelectElement;

const registerForm = document.querySelector<HTMLFormElement>(".register-form");

if (registerForm) {
  const fields = registerForm.querySelectorAll<ValidatableField>(
    ".form-input, .form-select, .checkbox-input"
  );

  fields.forEach((field: ValidatableField): void => {
    const markTouched = (): void => field.classList.add("touched");
    field.addEventListener("blur", markTouched);
    field.addEventListener("change", markTouched);
  });
}
