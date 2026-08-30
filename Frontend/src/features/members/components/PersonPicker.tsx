import { useEffect, useRef, useState } from 'react';

import { TextField } from '../../../components/TextField';
import { emptyBrowseFilters } from '../../../api/browse.types';
import { isAbortError, searchContractors } from '../../../api/browse.api';
import type { ContractorSummary } from '../../../api/browse.types';
import { useLanguage } from '../../../i18n/useLanguage';

export interface PersonPickerProps {
  readonly value: ContractorSummary | null;
  readonly onPick: (person: ContractorSummary | null) => void;
  readonly disabled: boolean;
}

/**
 * Finds the person to invite through the existing Browse search, which already hides anyone on
 * either side of a block. Nothing new queries people.
 */
export const PersonPicker = ({ value, onPick, disabled }: PersonPickerProps) => {
  const { t } = useLanguage();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<readonly ContractorSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = term.trim();
    if (value !== null || query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;
      setSearching(true);

      searchContractors({ ...emptyBrowseFilters, q: query }, null, 8, next.signal)
        .then((page) => {
          setResults(page.contractors);
          setSearching(false);
        })
        .catch((error: unknown) => {
          if (isAbortError(error)) return;
          setResults([]);
          setSearching(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [term, value]);

  useEffect(() => () => controller.current?.abort(), []);

  if (value !== null) {
    return (
      <div className="member-picked">
        <span className="member-picked__name" dir="auto">
          {t.members.invite.selected.replace('{name}', `${value.firstName} ${value.lastName}`.trim())}
        </span>
        <button
          type="button"
          className="btn btn--quiet btn--sm"
          disabled={disabled}
          onClick={() => {
            onPick(null);
            setTerm('');
          }}
        >
          {t.members.invite.clear}
        </button>
      </div>
    );
  }

  return (
    <div className="member-picker">
      <TextField
        id="memberSearch"
        label={t.members.invite.search.label}
        placeholder={t.members.invite.search.placeholder}
        value={term}
        onChange={setTerm}
      />

      {searching ? <p className="field-hint" role="status">{t.members.invite.searching}</p> : null}

      {!searching && term.trim().length >= 2 && results.length === 0 ? (
        <p className="field-hint">{t.members.invite.noResults}</p>
      ) : null}

      {results.length > 0 ? (
        <ul className="member-picker__list">
          {results.map((person) => (
            <li key={person.userId}>
              <button
                type="button"
                className="member-picker__option"
                disabled={disabled}
                onClick={() => onPick(person)}
              >
                <span dir="auto">{`${person.firstName} ${person.lastName}`.trim()}</span>
                <span className="member-picker__company" dir="auto">
                  {person.companyName ?? t.members.row.noCompany}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
