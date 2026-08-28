// Mark a field "touched" once the user leaves it or commits a value, so CSS shows a
// validation state only after an interaction rather than on a pristine form.
// This covers empty required fields, which :user-invalid alone would miss because it
// only fires once the value has changed.
// Selects and checkboxes also need "change", because blur alone is unreliable for a
// control committed by click or by keyboard.
(function (): void {
  type ValidatableField = HTMLInputElement | HTMLSelectElement;

  const fields = document.querySelectorAll<ValidatableField>(
    '.form-input, .form-select, .checkbox-input'
  );

  fields.forEach((field: ValidatableField): void => {
    const markTouched = (): void => field.classList.add('touched');
    field.addEventListener('blur', markTouched);
    field.addEventListener('change', markTouched);
  });
})();
