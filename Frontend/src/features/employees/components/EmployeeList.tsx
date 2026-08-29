import { ButtonSpinner } from '../../../components/ButtonSpinner';
import type { EmployeeMembership } from '../../../api/types';
import { useLanguage } from '../../../i18n/useLanguage';
import type { EmployeeManagementState } from '../useEmployeeManagement';

/**
 * One row, drawn from the fields the server actually holds for that stage of the relationship.
 *
 * An `invited` row is a seat, not a person: nobody has registered against it, so there is no email
 * address, no phone number and no profile to show, and this renders none of them. Inventing a
 * placeholder for any of the three would make an unclaimed seat look like an account.
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
  const approving = state.approvingId === row.id;

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

      {/*
       * Approve appears only where the server says a relationship is waiting for it. The project's
       * rule is absence over a disabled fake action, and a greyed-out Approve on somebody already
       * active would be exactly that — a control that can never do anything, on every row.
       */}
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
    </li>
  );
};

/**
 * The list, its bulk action and the states that stand in for it.
 *
 * Every state here is one the server can genuinely be in. A company with no seats yet and a
 * company with nobody waiting are both correct answers, so each gets a sentence rather than a
 * screen padded with rows nobody created.
 */
export const EmployeeList = ({ state }: { state: EmployeeManagementState }) => {
  const { t } = useLanguage();

  // Only the two the feature does not turn away at the door reach this component; the rest are
  // answered once, for the whole screen, by `EmployeeManagement`.
  const listMessage =
    state.listFailure === 'NETWORK' ? t.employees.errors.network
    : state.listFailure ? t.employees.errors.generic
    : null;

  const actionMessage =
    state.actionFailure === 'NOTHING_TO_APPROVE' ? t.employees.errors.nothingToApprove
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

        {/*
         * One request for everybody waiting, and it is offered only while somebody is. The server
         * answers this endpoint itself, so approving twelve people is one call rather than twelve
         * that could each land differently.
         */}
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
        // A list that could not be read is not an empty list. Saying "no seats opened yet" here
        // would report a fact about the company from a failure to reach the server.
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
