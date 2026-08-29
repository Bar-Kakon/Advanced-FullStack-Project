import { useLanguage } from '../../../i18n/useLanguage';
import { useAuthedImage } from '../useAuthedImage';

const CLASSES = {
  tile: { box: 'work-item__thumb', image: 'work-item__thumb work-item__thumb--image', icon: 34 },
  row: { box: 'work-thumb work-thumb--empty', image: 'work-thumb work-thumb--image', icon: 24 },
} as const;

/** The stored photo of one completed-work entry, or the neutral placeholder when there is none. */
export const WorkPhoto = ({
  url,
  title,
  variant = 'tile',
}: {
  url: string | null;
  title: string;
  variant?: keyof typeof CLASSES;
}) => {
  const { t } = useLanguage();
  const source = useAuthedImage(url);
  const style = CLASSES[variant];

  if (source === null) {
    return (
      <span className={style.box} aria-hidden="true">
        <svg width={style.icon} height={style.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.5" />
          <path d="M21 15l-5-5L5 20" />
        </svg>
      </span>
    );
  }

  return (
    <img
      className={style.image}
      src={source}
      alt={t.editProfile.work.imageAlt.replace('{title}', title)}
    />
  );
};