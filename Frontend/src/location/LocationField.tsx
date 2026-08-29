import { useLanguage } from '../i18n/useLanguage';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { placesConfigured } from './usePlacesAutocomplete';
import type { StructuredPlace } from './place.types';

/**
 * Where a person says where they are, on Register and on Edit profile.
 *
 * A chosen place is structured, because driving distance needs a Place ID. Two cases are not, and
 * both are handled here rather than in each screen: an account that predates structured selection
 * keeps its typed city and is shown it, and a build with no browser Places key falls back to a
 * plain text box so that registration is never blocked by a maps outage.
 */
export const LocationField = ({
  label,
  placeholder,
  place,
  city,
  onPlace,
  onCity,
  required = false,
}: {
  label: string;
  placeholder?: string;
  place: StructuredPlace | null;
  city: string;
  onPlace: (place: StructuredPlace | null) => void;
  onCity: (city: string) => void;
  required?: boolean;
}) => {
  const { t } = useLanguage();

  if (!placesConfigured) {
    return (
      <div className="form-group">
        <label className="field-label" htmlFor="city">{label}</label>
        <input
          className="form-input"
          id="city"
          name="city"
          type="text"
          dir="auto"
          value={city}
          placeholder={placeholder ?? ''}
          onChange={(event) => onCity(event.target.value)}
          {...(required ? { 'aria-required': true } : {})}
        />
        <p className="field-hint">{t.location.unavailableFallback}</p>
      </div>
    );
  }

  return (
    <>
      <PlaceAutocomplete
        label={label}
        value={place}
        onChange={(chosen) => {
          onPlace(chosen);
          if (chosen) onCity(chosen.city ?? chosen.displayName);
        }}
        {...(placeholder === undefined ? {} : { placeholder })}
      />
      {place === null && city.trim() !== '' ? (
        <p className="field-hint">{t.location.legacyCity.replace('{city}', city)}</p>
      ) : null}
    </>
  );
};
