import { useState } from 'react';

import { COMPANY_POSITIONS, type CompanyPosition } from '../../../api/types';
import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { FormAlert } from '../../../components/FormAlert';
import { EditSelect, EditText } from '../../profile/components/EditField';
import { useLanguage } from '../../../i18n/useLanguage';
import type { EmployeeManagementState } from '../useEmployeeManagement';

/** The longest name the invitation endpoint accepts, from `createInvitationBodySchema`. */
const MAX_FULL_NAME_LENGTH = 200;

/**
 * Two fields, and the absence of the rest is the model: a seat is matched to a self-registration
 * by name, company and position, and the person supplies their own credentials when they register.
 * The company comes from the caller's own session, so it is never asked for here.
 */
export const InviteEmployeeForm = ({ state }: { state: EmployeeManagementState }) => {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState('');
  const [companyPosition, setCompanyPosition] = useState<CompanyPosition | ''>('');
  const [touched, setTouched] = useState(false);

  const positionOptions = COMPANY_POSITIONS.map((code) => ({
    value: code,
    label: t.companyPositions[code],
  }));

  const isComplete = fullName.trim().length > 0 && companyPosition !== '';

  const alertMessage =
    state.inviteFailure === 'NOT_PERMITTED' ? t.employees.errors.notPermitted
    : state.inviteFailure === 'NO_COMPANY' ? t.employees.errors.noCompany
    : state.inviteFailure === 'UNAUTHENTICATED' ? t.employees.errors.unauthenticated
    : state.inviteFailure === 'VALIDATION' ? t.employees.errors.validation
    : state.inviteFailure === 'NETWORK' ? t.employees.errors.network
    : state.inviteFailure ? t.employees.errors.generic
    : null;

  const submit = async (): Promise<void> => {
    setTouched(true);
    // Also narrows the placeholder away, so the payload cannot carry an empty position.
    if (!isComplete) return;

    const opened = await state.invite({ fullName, companyPosition });
    // Cleared only on success, so a seat refused by the server can be corrected rather than retyped.
    if (opened) {
      setFullName('');
      setCompanyPosition('');
      setTouched(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="invite-title">
      <h2 id="invite-title" className="panel__title">{t.employees.invite.title}</h2>
      <p className="panel__lede">{t.employees.invite.lede}</p>

      {alertMessage ? <FormAlert message={alertMessage} /> : null}

      {state.invited && !alertMessage ? (
        <p className="notice" role="status" aria-live="polite">
          <span>{t.employees.invite.created}</span>
        </p>
      ) : null}

      {/* noValidate: the instructor rule is no native validation popups. */}
      <form
        className="invite-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="invite-form__fields">
          <EditText
            id="invitedFullName"
            label={t.employees.invite.fullName.label}
            placeholder={t.employees.invite.fullName.placeholder}
            hint={t.employees.invite.fullName.hint}
            dir="auto"
            maxLength={MAX_FULL_NAME_LENGTH}
            required
            touched={touched}
            value={fullName}
            onChange={setFullName}
            onBlur={() => setTouched(true)}
          />

          <EditSelect
            id="invitedCompanyPosition"
            label={t.employees.invite.companyPosition.label}
            placeholder={t.employees.invite.companyPosition.placeholder}
            options={positionOptions}
            required
            value={companyPosition}
            onChange={setCompanyPosition}
          />
        </div>

        <button
          type="submit"
          className="btn btn--primary"
          disabled={!isComplete || state.inviting}
          aria-busy={state.inviting}
        >
          {t.employees.invite.submit}
          {state.inviting ? <ButtonSpinner /> : null}
        </button>
      </form>
    </section>
  );
};
