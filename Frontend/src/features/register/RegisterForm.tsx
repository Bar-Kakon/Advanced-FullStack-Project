import { REGIONS, TRADES, type Region, type Trade } from '../../api/types';
import { useLanguage } from '../../i18n/useLanguage';
import { MIN_PASSWORD_LENGTH, useRegisterForm } from './useRegisterForm';
import { FieldLabel } from '../../components/FieldLabel';
import { FormAlert } from '../../components/FormAlert';
import { PasswordField } from '../../components/PasswordField';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { AvailabilityChoice } from './components/AvailabilityChoice';
import { TermsCheckbox } from './components/TermsCheckbox';

/** Bounds copied from the endpoint's schema, so the box refuses what the server would reject. */
const MAX = {
  name: 100, companyName: 120, email: 254, city: 80, phone: 30, password: 200, specialtyOther: 60,
} as const;

export const RegisterForm = ({ form }: { form: ReturnType<typeof useRegisterForm> }) => {
  const { t } = useLanguage();
  const { values, setValue, touched, markTouched, errors, isComplete, submitting, failure } = form;

  const alertMessage =
    failure === 'EMAIL_ALREADY_REGISTERED' ? t.errors.emailTaken
    : failure === 'REQUEST_VALIDATION_FAILED' ? t.errors.validation
    : failure === 'NETWORK' ? t.errors.network
    : failure ? t.errors.generic
    : null;

  // Option lists pair a language-neutral code with the label for the language on screen. Built
  // here rather than stored, so switching language relabels them without touching any value.
  const tradeOptions = TRADES.map((code) => ({ value: code, label: t.trades[code] }));
  const regionOptions = REGIONS.map((code) => ({ value: code, label: t.regions[code] }));

  return (
    <>
      {alertMessage ? <FormAlert message={alertMessage} /> : null}

      {/* onSubmit rather than a click handler: it also fires on Enter in a text field, which is
          how people actually submit a form. preventDefault stops the browser's own navigation. */}
      <form
        className="register-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.submit();
        }}
      >
        <TextField
          className="col--half" id="firstName" label={t.form.firstName.label}
          placeholder={t.form.firstName.placeholder} autoComplete="given-name" maxLength={MAX.name} required
          value={values.firstName} onChange={(v) => setValue('firstName', v)}
          onBlur={() => markTouched('firstName')} touched={!!touched.firstName}
        />
        <TextField
          className="col--half" id="lastName" label={t.form.lastName.label}
          placeholder={t.form.lastName.placeholder} autoComplete="family-name" maxLength={MAX.name} required
          value={values.lastName} onChange={(v) => setValue('lastName', v)}
          onBlur={() => markTouched('lastName')} touched={!!touched.lastName}
        />
        <TextField
          className="col--full" id="companyName" label={t.form.companyName.label}
          placeholder={t.form.companyName.placeholder} autoComplete="organization" maxLength={MAX.companyName} required
          value={values.companyName} onChange={(v) => setValue('companyName', v)}
          onBlur={() => markTouched('companyName')} touched={!!touched.companyName}
        />
        <TextField
          className="col--half" id="email" label={t.form.email.label} type="email" dir="ltr"
          placeholder={t.form.email.placeholder} autoComplete="email" maxLength={MAX.email} required
          value={values.email} onChange={(v) => setValue('email', v)}
          onBlur={() => markTouched('email')} touched={!!touched.email}
          {...(errors.email ? { error: t.form.email.error } : {})}
        />

        <SelectField<Trade>
          className="col--half" id="specialty" label={t.form.specialty.label}
          placeholder={t.form.specialty.placeholder} options={tradeOptions} required
          hint={t.form.specialty.hint}
          value={values.specialty} onChange={(v) => setValue('specialty', v)}
          onBlur={() => markTouched('specialty')} touched={!!touched.specialty}
        >
          {/* Revealed by the value rather than by a CSS `:has()` on the checked option — same
              condition the server enforces, which is why it can never send a stale value. */}
          {values.specialty === 'other' ? (
            <div className="other-trade other-trade--visible">
              <FieldLabel plain text={t.form.specialtyOther.label} />
              <input
                className="form-input" type="text" name="specialtyOther"
                maxLength={MAX.specialtyOther} placeholder={t.form.specialtyOther.placeholder}
                value={values.specialtyOther}
                onChange={(e) => setValue('specialtyOther', e.target.value)}
              />
            </div>
          ) : null}
        </SelectField>

        {/* City, region and the two phones share one grid cell, stacked. */}
        <div className="field-stack col--half">
          <TextField
            id="city" label={t.form.city.label} placeholder={t.form.city.placeholder}
            autoComplete="address-level2" maxLength={MAX.city} required
            value={values.city} onChange={(v) => setValue('city', v)}
            onBlur={() => markTouched('city')} touched={!!touched.city}
          />
          <SelectField<Region>
            id="region" label={t.form.region.label} placeholder={t.form.region.placeholder}
            options={regionOptions} required
            value={values.region} onChange={(v) => setValue('region', v)}
            onBlur={() => markTouched('region')} touched={!!touched.region}
          />
          {/* Two independent numbers. Each is optional on its own, and neither is derived from
              the other — they are stored on two different documents server-side. */}
          <TextField
            id="officePhone" label={t.form.officePhone.label} optionalText={t.form.optional}
            type="tel" dir="ltr" placeholder={t.form.officePhone.placeholder}
            autoComplete="work tel" maxLength={MAX.phone}
            value={values.officePhone} onChange={(v) => setValue('officePhone', v)}
          />
          <TextField
            id="businessPhone" label={t.form.businessPhone.label} optionalText={t.form.optional}
            type="tel" dir="ltr" placeholder={t.form.businessPhone.placeholder}
            autoComplete="tel" maxLength={MAX.phone}
            value={values.businessPhone} onChange={(v) => setValue('businessPhone', v)}
          />
        </div>

        <AvailabilityChoice
          legend={t.form.availability.label} hint={t.form.availability.hint}
          labels={t.availability}
          value={values.availability} onChange={(v) => setValue('availability', v)}
        />

        <PasswordField
          className="col--half"
          id="password" name="password" label={t.form.password.label} placeholder={t.form.password.placeholder}
          hint={t.form.password.hint} toggleLabel={t.form.togglePassword}
          minLength={MIN_PASSWORD_LENGTH} maxLength={MAX.password}
          value={values.password} onChange={(v) => setValue('password', v)}
          onBlur={() => markTouched('password')} touched={!!touched.password}
          {...(errors.password ? { error: t.form.password.error } : {})}
        />
        <PasswordField
          className="col--half"
          id="password-confirm" name="confirmPassword" label={t.form.confirmPassword.label}
          placeholder={t.form.confirmPassword.placeholder} toggleLabel={t.form.togglePassword}
          maxLength={MAX.password}
          value={values.confirmPassword} onChange={(v) => setValue('confirmPassword', v)}
          onBlur={() => markTouched('confirmPassword')} touched={!!touched.confirmPassword}
          {...(errors.confirmPassword ? { error: t.form.confirmPassword.error } : {})}
        />

        <TermsCheckbox
          terms={t.form.terms} checked={values.acceptedTerms}
          onChange={(v) => setValue('acceptedTerms', v)}
          onBlur={() => markTouched('acceptedTerms')} touched={!!touched.acceptedTerms}
        />

        <button type="submit" className="btn btn--primary btn--full col--full" disabled={!isComplete || submitting}>
          {submitting ? t.form.submitting : t.form.submit}
        </button>
      </form>
    </>
  );
};
