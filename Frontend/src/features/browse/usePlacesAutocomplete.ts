import { useEffect, useRef, useState } from 'react';

import type { StructuredPlace } from '../../api/browse.types';

const PLACES_KEY = import.meta.env['VITE_GOOGLE_MAPS_API_KEY'] as string | undefined;
const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const PLACE_DETAILS_URL = 'https://places.googleapis.com/v1/places';
const DEBOUNCE_MS = 300;

interface Suggestion {
  readonly placePrediction?: { readonly placeId?: string; readonly text?: { readonly text?: string } };
}

/**
 * Google Places Autocomplete from the browser, using the browser-restricted key only. The
 * server-side credential is never shipped here.
 *
 * A prediction carries no coordinates, so the chosen place is resolved to its details before it
 * leaves this hook — which is what lets the rest of the app treat a place as always structured.
 */
export const usePlacesAutocomplete = (query: string) => {
  const [suggestions, setSuggestions] = useState<readonly StructuredPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [unavailable, setUnavailable] = useState(!PLACES_KEY);
  const sequence = useRef(0);

  useEffect(() => {
    if (!PLACES_KEY) {
      setUnavailable(true);
      setSuggestions([]);
      return;
    }
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const ticket = ++sequence.current;
    const controller = new AbortController();
    setSearching(true);

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(AUTOCOMPLETE_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': PLACES_KEY },
            body: JSON.stringify({ input: query, includedRegionCodes: ['il'] }),
          });
          if (!response.ok) throw new Error(String(response.status));

          const body = (await response.json()) as { suggestions?: Suggestion[] };
          const predictions = (body.suggestions ?? [])
            .map((entry) => entry.placePrediction)
            .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId));

          const detailed = await Promise.all(
            predictions.slice(0, 6).map(async (prediction) => {
              const details = await fetch(
                `${PLACE_DETAILS_URL}/${encodeURIComponent(prediction.placeId!)}`,
                {
                  signal: controller.signal,
                  headers: {
                    'X-Goog-Api-Key': PLACES_KEY,
                    'X-Goog-FieldMask': 'id,displayName,location,addressComponents',
                  },
                },
              );
              if (!details.ok) return null;

              const place = (await details.json()) as {
                id?: string;
                displayName?: { text?: string };
                location?: { latitude?: number; longitude?: number };
                addressComponents?: { longText?: string; types?: string[] }[];
              };
              if (!place.id || typeof place.location?.latitude !== 'number') return null;

              const city = place.addressComponents?.find((c) => c.types?.includes('locality'))?.longText;
              const adminArea = place.addressComponents?.find((c) =>
                c.types?.includes('administrative_area_level_1'),
              )?.longText;

              return {
                placeId: place.id,
                displayName: place.displayName?.text ?? prediction.text?.text ?? place.id,
                latitude: place.location.latitude,
                longitude: place.location.longitude!,
                ...(city === undefined ? {} : { city }),
                ...(adminArea === undefined ? {} : { adminArea }),
              } satisfies StructuredPlace;
            }),
          );

          if (ticket !== sequence.current) return;
          setSuggestions(detailed.filter((p): p is StructuredPlace => p !== null));
          setUnavailable(false);
        } catch (error) {
          if ((error as Error).name === 'AbortError' || ticket !== sequence.current) return;
          setUnavailable(true);
          setSuggestions([]);
        } finally {
          if (ticket === sequence.current) setSearching(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { suggestions, searching, unavailable };
};