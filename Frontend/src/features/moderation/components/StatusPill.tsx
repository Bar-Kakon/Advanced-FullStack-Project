import { useLanguage } from '../../../i18n/useLanguage';
import type { ModerationReportStatus } from '../../../api/moderation.types';

/**
 * The state, in words. The class only adds a border weight — the status is legible with every
 * colour removed, because colour is never the only carrier of meaning.
 */
export const StatusPill = ({ status }: { status: ModerationReportStatus }) => {
  const { t } = useLanguage();

  return <span className={`mod-pill mod-pill--${status}`}>{t.moderation.statuses[status]}</span>;
};