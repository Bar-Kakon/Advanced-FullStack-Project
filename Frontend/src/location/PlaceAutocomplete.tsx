import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useLanguage } from '../i18n/useLanguage';
import type { StructuredPlace } from './place.types';
import { usePlacesAutocomplete } from './usePlacesAutocomplete';

/**
 * Structured place selection, shared by Browse, Register and Edit profile. The chosen value is
 * always a Google place with an id — free text is never the stored identity.
 */
export const PlaceAutocomplete = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: StructuredPlace | null;
  onChange: (place: StructuredPlace | null) => void;
  placeholder?: string;
}) => {
  const { t } = useLanguage();
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const { suggestions, searching, unavailable } = usePlacesAutocomplete(open ? query : '');

  useEffect(() => {
    const onOutside = (event: MouseEvent): void => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const choose = useCallback(
    (place: StructuredPlace): void => {
      onChange(place);
      setQuery('');
      setOpen(false);
      setActive(-1);
    },
    [onChange],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!open || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      const chosen = suggestions[active];
      if (chosen) choose(chosen);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="form-group place-field" ref={boxRef}>
      <label className="field-label" htmlFor={inputId}>{label}</label>

      {value ? (
        <div className="place-field__chosen">
          <span className="place-field__name" dir="auto">{value.displayName}</span>
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => onChange(null)}>
            {t.browse.place.clear}
          </button>
        </div>
      ) : (
        <>
          <input
            id={inputId}
            className="form-input"
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            dir="auto"
            placeholder={placeholder ?? t.browse.place.placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />

          {open && query.trim().length > 1 ? (
            <ul className="place-field__list" id={listId} role="listbox">
              {unavailable ? (
                <li className="place-field__note">{t.browse.place.unavailable}</li>
              ) : searching ? (
                <li className="place-field__note">{t.browse.place.searching}</li>
              ) : suggestions.length === 0 ? (
                <li className="place-field__note">{t.browse.place.noResults}</li>
              ) : (
                suggestions.map((place, index) => (
                  <li key={place.placeId} role="option" aria-selected={index === active}>
                    <button
                      type="button"
                      className={`place-field__option${index === active ? ' is-active' : ''}`}
                      onClick={() => choose(place)}
                      dir="auto"
                    >
                      {place.displayName}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
};