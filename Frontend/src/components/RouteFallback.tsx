import { useLanguage } from '../i18n/useLanguage';

/** Shown while a lazily-loaded route chunk is fetched. */
export const RouteFallback = () => {
  const { t } = useLanguage();

  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <span className="route-fallback__spinner" aria-hidden="true" />
      <span className="route-fallback__text">{t.routeLoading}</span>
    </div>
  );
};
