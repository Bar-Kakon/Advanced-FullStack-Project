import { AppNav } from '../../components/AppNav';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { localeOf } from '../../i18n/dateFormat';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { useAuditLog } from './useAuditLog';
import {
  PLATFORM_AUDIT_ACTIONS,
  PLATFORM_AUDIT_TARGET_TYPES,
  type PlatformAuditAction,
  type PlatformAuditTargetType,
} from '../../api/moderation.types';
import profileCss from '../profile/profile.css?inline';
import moderationCss from './moderation.css?inline';

const isAction = (value: string): value is PlatformAuditAction =>
  (PLATFORM_AUDIT_ACTIONS as readonly string[]).includes(value);

const isTargetType = (value: string): value is PlatformAuditTargetType =>
  (PLATFORM_AUDIT_TARGET_TYPES as readonly string[]).includes(value);

/**
 * The platform audit trail. Administrative history only: project events have their own trail and
 * never appear here.
 */
export const AuditLogPage = () => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const audit = useAuditLog();

  useScreenStylesheet({ id: 'profile.css', css: profileCss }, { id: 'moderation.css', css: moderationCss });
  useDocumentTitle(t.audit.documentTitle);

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';

  const stamp = (iso: string): string =>
    new Date(iso).toLocaleString(localeOf(lang));

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <h1 className="profile__title">{t.audit.title}</h1>
          <p className="profile__sub">{t.audit.lede}</p>
        </header>

        <div className="moderation__filters">
          <label className="moderation__filter">
            <span className="moderation__filter-label">{t.audit.filterAction}</span>
            <select
              className="moderation__select"
              value={audit.action}
              onChange={(event) =>
                audit.setAction(isAction(event.target.value) ? event.target.value : '')
              }
            >
              <option value="">{t.audit.allActions}</option>
              {PLATFORM_AUDIT_ACTIONS.map((code) => (
                <option key={code} value={code}>
                  {t.audit.actions[code]}
                </option>
              ))}
            </select>
          </label>

          <label className="moderation__filter">
            <span className="moderation__filter-label">{t.audit.filterTarget}</span>
            <select
              className="moderation__select"
              value={audit.targetType}
              onChange={(event) =>
                audit.setTargetType(isTargetType(event.target.value) ? event.target.value : '')
              }
            >
              <option value="">{t.audit.allTargets}</option>
              {PLATFORM_AUDIT_TARGET_TYPES.map((code) => (
                <option key={code} value={code}>
                  {t.audit.targets[code]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {audit.loading ? <p className="profile__sub">{t.audit.loading}</p> : null}
        {audit.failure ? <p className="profile__sub">{t.audit.failure}</p> : null}

        {!audit.loading && !audit.failure && audit.rows.length === 0 ? (
          <p className="profile__sub">{t.audit.empty}</p>
        ) : null}

        {audit.rows.length > 0 ? (
          <ul className="moderation__list">
            {audit.rows.map((row) => (
              <li key={row.id} className="moderation__row">
                <div className="moderation__row-main">
                  <span className="moderation__row-title">{t.audit.actions[row.action]}</span>
                  <span className="moderation__row-meta">
                    {t.audit.targets[row.targetType]} · {row.targetId}
                  </span>
                </div>
                <div className="moderation__row-side">
                  <span className="moderation__row-meta">
                    {row.actor.name ?? t.audit.unknownActor}
                  </span>
                  <time className="moderation__row-meta" dateTime={row.at}>
                    {stamp(row.at)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {audit.hasMore ? (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={audit.loadMore}
            disabled={audit.loadingMore}
          >
            {t.audit.loadMore}
          </button>
        ) : null}
      </main>
    </div>
  );
};
