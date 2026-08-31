import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { FormAlert } from '../../../components/FormAlert';
import { useLanguage } from '../../../i18n/useLanguage';
import { formatCalendarDate } from '../../../i18n/dateFormat';
import type { ProjectInvitation } from '../../../api/members.types';
import type { MembersFailure } from '../../../api/members.api';


export interface PendingInvitationsProps {
  readonly invitations: readonly ProjectInvitation[];
  readonly busyId: string | null;
  readonly failure: MembersFailure | null;
  readonly onAccept: (id: string) => void;
  readonly onDecline: (id: string) => void;
}

/**
 * What an invited person is shown BEFORE answering: name, type, city, both dates, who invited and
 * the role offered. Nothing about the members, the work or any count is served until they accept.
 */
export const PendingInvitations = ({
  invitations, busyId, failure, onAccept, onDecline,
}: PendingInvitationsProps) => {
  const { t, lang } = useLanguage();

  if (invitations.length === 0 && failure === null) return null;

  return (
    <section className="panel" aria-labelledby="invitations-title" aria-live="polite">
      <h2 id="invitations-title" className="panel__title">{t.members.incoming.title}</h2>
      <p className="panel__lede">{t.members.incoming.lede}</p>

      {failure !== null ? <FormAlert message={t.members.errors.unknown} /> : null}

      {invitations.length === 0 ? (
        <p className="panel__lede">{t.members.incoming.none}</p>
      ) : (
        <ul className="project-list">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="project-card project-card--invitation">
              <div className="project-card__head">
                <h3 className="project-card__name" dir="auto">{invitation.projectName}</h3>
                <span className="project-card__badges">
                  <span className="project-chip project-chip--type">
                    {invitation.projectType === 'other' && invitation.projectTypeOther
                      ? invitation.projectTypeOther
                      : t.projects.type[invitation.projectType]}
                  </span>
                </span>
              </div>

              <p className="project-card__meta">
                <span dir="auto">{invitation.city ?? t.projects.card.noLocation}</span>
                <span>
                  {t.members.incoming.dates
                    .replace('{start}', formatCalendarDate(invitation.startDate, lang))
                    .replace('{target}', formatCalendarDate(invitation.targetEndDate, lang))}
                </span>
              </p>

              <p className="project-card__meta">
                {invitation.invitedByName ? (
                  <span dir="auto">
                    {t.members.incoming.invitedBy.replace('{name}', invitation.invitedByName)}
                  </span>
                ) : null}
                <span>
                  {t.members.incoming.role.replace('{role}', t.permissions.roles[invitation.projectRole])}
                </span>
              </p>

              <div className="project-card__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busyId !== null}
                  onClick={() => onAccept(invitation.id)}
                >
                  {t.members.incoming.accept}
                  {busyId === invitation.id ? <ButtonSpinner /> : null}
                </button>
                <button
                  type="button"
                  className="btn btn--quiet btn--sm"
                  disabled={busyId !== null}
                  onClick={() => onDecline(invitation.id)}
                >
                  {t.members.incoming.decline}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
