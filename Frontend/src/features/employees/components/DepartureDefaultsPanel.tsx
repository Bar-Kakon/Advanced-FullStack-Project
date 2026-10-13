import { useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import { saveDepartureDefaults } from '../../../api/employees.api';
import type { EmployeeOption } from './DepartureWorkbench';

/**
 * Step 3 of the responsibility precedence: the owner's saved default, applied automatically when a
 * departure settles work nobody arranged explicitly. An ineligible target simply falls through.
 */
export const DepartureDefaultsPanel = ({ employees }: { employees: readonly EmployeeOption[] }) => {
  const { t } = useLanguage();
  const copy = t.employees.departureDefaults;

  const [arrangement, setArrangement] = useState<'owner_only' | 'transferred' | 'shared'>('owner_only');
  const [trackee, setTrackee] = useState('');
  const [assignee, setAssignee] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setSaved(false);
    setFailed(false);
    try {
      await saveDepartureDefaults({
        commissioned: {
          arrangement,
          ...(arrangement === 'owner_only' || trackee === '' ? {} : { trackeeUserId: trackee }),
        },
        ...(assignee === '' ? {} : { assigned: { assigneeUserId: assignee } }),
      });
      setSaved(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="departure-defaults-title">
      <h2 id="departure-defaults-title" className="panel__title">{copy.title}</h2>
      <p className="panel__lede">{copy.lede}</p>

      {failed ? <p className="notice notice--error" role="alert">{copy.failed}</p> : null}
      {saved ? <p className="panel__lede" role="status">{copy.saved}</p> : null}

      <div className="departure-bulk">
        <label className="departure-item">
          <span>{copy.commissionedLabel}</span>
          <select
            className="form-input departure-bulk__select"
            value={arrangement}
            onChange={(event) =>
              setArrangement(event.target.value as 'owner_only' | 'transferred' | 'shared')
            }
          >
            <option value="owner_only">{t.employees.departure.choiceOwnerOnly}</option>
            <option value="transferred">{t.employees.departure.choiceTransferred}</option>
            <option value="shared">{t.employees.departure.choiceShared}</option>
          </select>
        </label>

        {arrangement !== 'owner_only' ? (
          <select
            className="form-input departure-bulk__select"
            value={trackee}
            onChange={(event) => setTrackee(event.target.value)}
          >
            <option value="">{t.employees.departure.pickEmployee}</option>
            {employees.map((person) => (
              <option key={person.userId} value={person.userId}>{person.name}</option>
            ))}
          </select>
        ) : null}

        <label className="departure-item">
          <span>{copy.assignedLabel}</span>
          <select
            className="form-input departure-bulk__select"
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
          >
            <option value="">{copy.assignedNone}</option>
            {employees.map((person) => (
              <option key={person.userId} value={person.userId}>{person.name}</option>
            ))}
          </select>
        </label>

        <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => void save()}>
          {copy.save}
          {busy ? <ButtonSpinner /> : null}
        </button>
      </div>
    </section>
  );
};
