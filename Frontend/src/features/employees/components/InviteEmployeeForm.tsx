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
 * The form that opens a seat, and the two fields it is allowed to ask for.
 *
 * There is no email box, no password box and no phone box, and their absence is the approved
 * model rather than an omission: a seat is matched against a self-registration by name, company
 * and position, so the person supplies their own credentials when they register. Asking for an
 * address here would create a second, unused idea of who the employee is.
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
    // `isComplete` carries the `companyPosition !== ''` test, so this also narrows the placeholder
    // away and the payload below cannot be built with an empty position.
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

      {/* Announced when it appears, so the confirmation is not something only a sighted user gets. */}
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
            // A person's name follows the name, not the interface: a Latin name typed into the
            // Hebrew screen still reads left to right.
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
