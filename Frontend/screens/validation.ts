// Mark a field "touched" on blur so CSS can show its validation state only
// after the user leaves it — covers empty required fields, which :user-invalid
// alone would miss (it only fires once the value is changed).
(function (): void {
  const fields = document.querySelectorAll<HTMLInputElement>('.form-input');
  fields.forEach((field: HTMLInputElement): void => {
    field.addEventListener('blur', (): void => {
      field.classList.add('touched');
    });
  });
})();
