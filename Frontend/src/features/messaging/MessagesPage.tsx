import { useCallback, useMemo, useState } from 'react';

import { AppNav } from '../../components/AppNav';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { toConversationRows } from './messageGrouping';
import { useConversation } from './useConversation';
import { useInbox } from './useInbox';
import profileCss from '../profile/profile.css?inline';
import messagingCss from './messaging.css?inline';

/**
 * Inbox and thread on one screen.
 *
 * The date is rendered once per calendar day and every message keeps its own time, both derived
 * from the persisted `sentAt` — never from when this client received anything.
 */
export const MessagesPage = () => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const inbox = useInbox();
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const thread = useConversation(openId);
  const [draft, setDraft] = useState('');

  useScreenStylesheet({ id: 'profile.css', css: profileCss }, { id: 'messaging.css', css: messagingCss });
  useDocumentTitle(t.messaging.documentTitle);

  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const dayLabel = (at: Date): string =>
    at.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeLabel = (iso: string): string =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const rows = useMemo(() => toConversationRows(thread.messages), [thread.messages]);

  const submit = useCallback(async (): Promise<void> => {
    const body = draft.trim();
    if (body.length === 0) return;

    await thread.send(body);
    setDraft('');
  }, [draft, thread]);

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <h1 className="profile__title">{t.messaging.title}</h1>
          <p className="profile__sub">{t.messaging.lede}</p>
        </header>

        <div className="msg-layout">
          <section>
            <div className="msg-tabs" role="tablist" aria-label={t.messaging.title}>
              {(['inbox', 'requests'] as const).map((folder) => (
                <button
                  key={folder}
                  type="button"
                  role="tab"
                  aria-selected={inbox.folder === folder}
                  className={`msg-tab ${inbox.folder === folder ? 'msg-tab--active' : ''}`}
                  onClick={() => inbox.setFolder(folder)}
                >
                  {folder === 'inbox' ? t.messaging.inbox : t.messaging.requests}
                </button>
              ))}
            </div>

            {inbox.loading ? <p className="msg-empty">{t.messaging.loading}</p> : null}
            {inbox.failure ? <p className="msg-empty">{t.messaging.failure}</p> : null}
            {!inbox.loading && !inbox.failure && inbox.conversations.length === 0 ? (
              <p className="msg-empty">
                {inbox.folder === 'inbox' ? t.messaging.emptyInbox : t.messaging.emptyRequests}
              </p>
            ) : null}

            <div className="msg-list">
              {inbox.conversations.map((conversation) => (
                <div key={conversation.id}>
                  <button
                    type="button"
                    className={`msg-row ${openId === conversation.id ? 'msg-row--active' : ''}`}
                    onClick={() => setOpenId(conversation.id)}
                  >
                    <span className="msg-row__title">{conversation.title}</span>
                    <span className="msg-row__meta">
                      {conversation.kind === 'project_room'
                        ? t.messaging.projectRoom
                        : conversation.requestState === 'pending'
                          ? t.messaging.pendingRequest
                          : conversation.lastMessageAt === null
                            ? ''
                            : dayLabel(new Date(conversation.lastMessageAt))}
                    </span>
                  </button>

                  {conversation.awaitingMyAnswer ? (
                    <div className="msg-agreement__actions">
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => void inbox.answer(conversation.id, true)}
                      >
                        {t.messaging.accept}
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => void inbox.answer(conversation.id, false)}
                      >
                        {t.messaging.decline}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="msg-thread">
            {openId === undefined ? (
              <p className="msg-empty">{t.messaging.pickConversation}</p>
            ) : (
              <>
                <div className="msg-thread__scroll">
                  {thread.hasOlder ? (
                    <button type="button" className="btn btn--secondary" onClick={thread.loadOlder}>
                      {t.messaging.loadOlder}
                    </button>
                  ) : null}

                  {rows.map((row) =>
                    row.kind === 'day' ? (
                      <div key={row.key} className="msg-day">
                        {dayLabel(row.at)}
                      </div>
                    ) : (
                      <div
                        key={row.key}
                        className={`msg-bubble ${row.message.mine ? 'msg-bubble--mine' : ''}`}
                      >
                        {row.message.mine ? null : (
                          <span className="msg-bubble__sender">{row.message.senderName}</span>
                        )}

                        {row.message.removed ? (
                          <span className="msg-bubble__body msg-bubble__removed">
                            {t.messaging.removedMessage}
                          </span>
                        ) : row.message.agreement !== null ? (
                          <div className="msg-agreement">
                            <div className="msg-agreement__title">{row.message.agreement.title}</div>
                            {row.message.agreement.description === null ? null : (
                              <div>{row.message.agreement.description}</div>
                            )}
                            <div className="msg-agreement__dates">
                              {row.message.agreement.startDate} – {row.message.agreement.dueDate}
                            </div>

                            {row.message.agreement.state === 'proposed' && !row.message.agreement.mine ? (
                              <div className="msg-agreement__actions">
                                <button
                                  type="button"
                                  className="btn btn--primary"
                                  onClick={() => void thread.answerAgreement(row.message.id, true)}
                                >
                                  {t.messaging.acceptAgreement}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--secondary"
                                  onClick={() => void thread.answerAgreement(row.message.id, false)}
                                >
                                  {t.messaging.declineAgreement}
                                </button>
                              </div>
                            ) : (
                              <div className="msg-agreement__state">
                                {t.messaging.agreementStates[
                                  row.message.agreement.state as 'proposed' | 'accepted' | 'declined' | 'withdrawn'
                                ]}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="msg-bubble__body">{row.message.body}</span>
                        )}

                        <time className="msg-bubble__time" dateTime={row.message.sentAt}>
                          {timeLabel(row.message.sentAt)}
                        </time>
                      </div>
                    ),
                  )}
                </div>

                <div className="msg-composer">
                  <textarea
                    className="msg-composer__input"
                    rows={2}
                    dir="auto"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={t.messaging.composerPlaceholder}
                    aria-label={t.messaging.composerPlaceholder}
                  />
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => void submit()}
                    disabled={thread.sending || draft.trim().length === 0}
                  >
                    {t.messaging.send}
                    {thread.sending ? <ButtonSpinner /> : null}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};
