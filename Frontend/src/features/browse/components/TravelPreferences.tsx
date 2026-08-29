import { useCallback, useEffect, useRef, useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import {
  classifyBrowseError,
  proposeTravelLocations,
  saveTravelPreferences,
} from '../../../api/browse.api';
import type {
  ApprovedTravelLocationPayload,
  StructuredPlace,
  TravelProposal,
} from '../../../api/browse.types';
import { PlaceAutocomplete } from './PlaceAutocomplete';

const KM_STEPS = [10, 25, 50, 75, 100, 150, 200];

/**
 * The approved travel flow: choose a base and a driving radius, review what Google proposed, remove
 * what you do not want, add anything it missed, then confirm.
 *
 * The confirmed list is what gets saved. Removing something keeps it out even though it is inside
 * the radius, and a manual addition stays in even though it is outside.
 */
export const TravelPreferences = ({ onClose }: { onClose: () => void }) => {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [base, setBase] = useState<StructuredPlace | null>(null);
  const [radiusKm, setRadiusKm] = useState(50);
  const [proposal, setProposal] = useState<TravelProposal | null>(null);
  const [chosen, setChosen] = useState<ApprovedTravelLocationPayload[]>([]);
  const [proposing, setProposing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const propose = useCallback(async (): Promise<void> => {
    if (!base || proposing) return;
    setProposing(true);
    setFailure(null);
    setSaved(false);
    try {
      const result = await proposeTravelLocations(base.placeId, radiusKm);
      setProposal(result);
      setChosen(
        result.suggested.map((place) => ({
          placeId: place.placeId,
          displayName: place.displayName,
          latitude: place.latitude,
          longitude: place.longitude,
          source: 'suggested' as const,
          ...(place.city === undefined ? {} : { city: place.city }),
          ...(place.adminArea === undefined ? {} : { adminArea: place.adminArea }),
          ...(place.drivingDistanceMeters === null
            ? {}
            : { drivingDistanceMeters: place.drivingDistanceMeters }),
        })),
      );
    } catch (error) {
      const code = classifyBrowseError(error);
      setFailure(
        code === 'LOCATION_SERVICE_NOT_CONFIGURED' ? t.browse.errors.locationNotConfigured
        : code === 'LOCATION_SERVICE_UNAVAILABLE' ? t.browse.errors.locationUnavailable
        : code === 'INVALID_PLACE_ID' ? t.browse.errors.invalidPlace
        : code === 'NETWORK' ? t.browse.errors.network
        : t.browse.errors.generic,
      );
    } finally {
      setProposing(false);
    }
  }, [base, radiusKm, proposing, t]);

  const addManually = useCallback((place: StructuredPlace | null): void => {
    if (!place) return;
    setChosen((current) =>
      current.some((entry) => entry.placeId === place.placeId)
        ? current
        : [...current, { ...place, source: 'manual' as const }],
    );
    setSaved(false);
  }, []);

  const confirm = useCallback(async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setFailure(null);
    try {
      await saveTravelPreferences({
        travelRadiusKm: radiusKm,
        ...(base ? { basePlace: { ...base, source: 'manual' as const } } : {}),
        approvedTravelLocations: chosen,
      });
      setSaved(true);
    } catch (error) {
      setFailure(
        classifyBrowseError(error) === 'NETWORK' ? t.browse.errors.network : t.browse.errors.generic,
      );
    } finally {
      setSaving(false);
    }
  }, [saving, radiusKm, base, chosen, t]);

  const insideRadius = new Set(proposal?.suggested.map((p) => p.placeId) ?? []);

  return (
    <div className="travel-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="travel-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.browse.travel.title}
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="travel-dialog__head">
          <h2 className="travel-dialog__title">{t.browse.travel.title}</h2>
          <button type="button" className="adv-panel__close" onClick={onClose}>
            {t.browse.profile.close}
          </button>
        </div>

        <div className="travel-dialog__body">
          <PlaceAutocomplete
            label={t.browse.travel.baseLabel}
            value={base}
            onChange={setBase}
          />

          <div className="form-group">
            <label className="field-label" htmlFor="travel-radius">
              {`${t.browse.travel.radiusLabel} — ${radiusKm} ${t.browse.advanced.km}`}
            </label>
            <input
              id="travel-radius"
              className="travel-slider"
              type="range"
              min={KM_STEPS[0]}
              max={KM_STEPS[KM_STEPS.length - 1]}
              step={5}
              value={radiusKm}
              onChange={(event) => setRadiusKm(Number(event.target.value))}
            />
          </div>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void propose()}
            disabled={!base || proposing}
            aria-busy={proposing}
          >
            {proposing ? t.browse.travel.proposing : t.browse.travel.propose}
            {proposing ? <ButtonSpinner /> : null}
          </button>

          {failure ? <p className="notice notice--warn" role="alert">{failure}</p> : null}

          {proposal ? (
            <section className="travel-review">
              <p className="travel-review__question">{t.browse.travel.reviewQuestion}</p>
              <p className="travel-review__note">{t.browse.travel.suggestedNote}</p>
              {proposal.partial ? (
                <p className="notice notice--warn">{t.browse.travel.partialNote}</p>
              ) : null}

              {chosen.length === 0 ? (
                <p className="pp-block__text">{t.browse.travel.empty}</p>
              ) : (
                <ul className="travel-list">
                  {chosen.map((place) => (
                    <li key={place.placeId} className="travel-list__item">
                      <span className="travel-list__name" dir="auto">
                        {place.displayName}
                        {place.drivingDistanceMeters !== undefined ? (
                          <span className="travel-list__km">
                            {` · ${Math.round(place.drivingDistanceMeters / 1000)} ${t.browse.advanced.km}`}
                          </span>
                        ) : null}
                        {!insideRadius.has(place.placeId) ? (
                          <span className="tag travel-list__outside">
                            {t.browse.travel.outsideRadius}
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="btn btn--quiet btn--sm"
                        onClick={() =>
                          setChosen((current) => current.filter((e) => e.placeId !== place.placeId))
                        }
                      >
                        {t.browse.travel.remove}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="travel-add">
                <PlaceAutocomplete
                  label={t.browse.travel.addManually}
                  value={null}
                  onChange={addManually}
                />
              </div>

              <div className="travel-dialog__foot">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void confirm()}
                  disabled={saving}
                  aria-busy={saving}
                >
                  {saving ? t.browse.travel.confirming : t.browse.travel.confirm}
                  {saving ? <ButtonSpinner /> : null}
                </button>
                {saved ? <p className="travel-saved" role="status">{t.browse.travel.saved}</p> : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
};