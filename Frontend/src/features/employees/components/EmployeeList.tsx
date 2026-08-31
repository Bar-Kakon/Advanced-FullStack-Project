import { ButtonSpinner } from '../../../components/ButtonSpinner';
import type { EmployeeMembership } from '../../../api/types';
import { useLanguage } from '../../../i18n/useLanguage';
import type { EmployeeManagementState } from '../useEmployeeManagement';

/**
 * An `invited` row is a seat, not a person: nobody has registered against it, so it has no email,
 * no phone and no profile, and none is drawn.
 */
const EmployeeRow = ({
  row,
  state,
}: {
  row: EmployeeMembership;
  state: EmployeeManagementState;
}) => {
  const { t } = useLanguage();
  const isPending = row.status === 'pending_company_approval';
  const isInvited = row.status === 'invited';
  const approving = state.approvingId === row.id;
  const cancelling = state.cancellingId === row.id;

  return (
    <li className={`employee-row${isPending ? ' employee-row--pending' : ''}`}>
      <div className="employee-row__text">
        {/* `dir="auto"` because a person's name follows the name, not the interface language. */}
        <p className="employee-row__name" dir="auto">
          {row.invitedFullName ?? t.employees.list.nameMissing}
        </p>
        <p className="employee-row__position">
          {row.companyPosition
            ? t.companyPositions[row.companyPosition]
            : t.employees.list.positionMissing}
        </p>
      </div>

      <span className="tag employee-row__status">{t.employees.status[row.status]}</span>

      {/* Absence over a disabled fake action: a greyed-out Approve could never do anything. */}
      {isPending ? (
        <button
          type="button"
          className="btn btn--ghost btn--sm employee-row__action"
          onClick={() => void state.approve(row.id)}
          disabled={approving || state.approvingAll}
          aria-busy={approving}
        >
          {t.employees.actions.approve}
          {approving ? <ButtonSpinner /> : null}
        </button>
      ) : null}

      {/* Only an unclaimed seat may be withdrawn, which is the same rule the server enforces. */}
      {isInvited ? (
        <button
          type="button"
          className="btn btn--quiet btn--sm employee-row__action"
          onClick={() => void state.cancel(row.id)}
          disabled={cancelling}
          aria-busy={cancelling}
        >
          {t.employees.actions.cancelInvitation}
          {cancelling ? <ButtonSpinner /> : null}
        </button>
      ) : null}
    </li>
  );
};

/** No seats yet and nobody waiting are both correct server answers, so each gets a sentence. */
export const EmployeeList = ({ state }: { state: EmployeeManagementState }) => {
  const { t } = useLanguage();

  // The rest are answered once, for the whole screen, by `EmployeeManagement`.
  const listMessage =
    state.listFailure === 'NETWORK' ? t.employees.errors.network
    : state.listFailure ? t.employees.errors.generic
    : null;

  const actionMessage =
    state.actionFailure === 'NOTHING_TO_APPROVE' ? t.employees.errors.nothingToApprove
    : state.actionFailure === 'NOTHING_TO_CANCEL' ? t.employees.errors.nothingToCancel
    : state.actionFailure === 'NOT_PERMITTED' ? t.employees.errors.notPermitted
    : state.actionFailure === 'NO_COMPANY' ? t.employees.errors.noCompany
    : state.actionFailure === 'UNAUTHENTICATED' ? t.employees.errors.unauthenticated
    : state.actionFailure === 'NETWORK' ? t.employees.errors.network
    : state.actionFailure ? t.employees.errors.generic
    : null;

  return (
    <section className="panel" aria-labelledby="employee-list-title">
      <div className="employee-list__head">
        <div>
          <h2 id="employee-list-title" className="panel__title">{t.employees.list.title}</h2>
          {state.employees.length > 0 ? (
            <p className="panel__lede">
              {t.employees.list.count.replace('{count}', String(state.employees.length))}
            </p>
          ) : null}
        </div>

        {/* Offered only while somebody is waiting, and it is one request, not one per row. */}
        {state.pendingCount > 0 ? (
          <button
            type="button"
            className="btn btn--primary btn--sm employee-list__bulk"
            onClick={() => void state.approveAll()}
            disabled={state.approvingAll || state.approvingId !== null}
            aria-busy={state.approvingAll}
          >
            {t.employees.actions.approveAll.replace('{count}', String(state.pendingCount))}
            {state.approvingAll ? <ButtonSpinner /> : null}
          </button>
        ) : null}
      </div>

      {actionMessage ? (
        <p className="notice notice--error" role="alert">{actionMessage}</p>
      ) : null}

      {state.loading && !state.loaded ? (
        <p className="panel__lede" role="status" aria-live="polite">{t.employees.loading}</p>
      ) : listMessage ? (
        // A list that could not be read is not an empty list.
        <>
          <p className="notice notice--error" role="alert">{listMessage}</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={state.refresh}>
            {t.employees.actions.refresh}
          </button>
        </>
      ) : state.employees.length === 0 ? (
        <p className="panel__lede">{t.employees.empty.noEmployees}</p>
      ) : (
        <>
          {state.pendingCount === 0 ? (
            <p className="panel__lede">{t.employees.empty.noPending}</p>
          ) : null}
          <ul className="employee-list">
            {state.employees.map((row) => (
              <EmployeeRow key={row.id} row={row} state={state} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
};
