import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { localeOf } from '../../i18n/dateFormat';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import {
  fetchContractorMute,
  fetchConversationMute,
  reportMessage,
  setContractorMute,
  setConversationMute,
  uploadAttachment,
} from '../../api/messaging.api';
import type { ConversationMessage, MessageAttachment } from '../../api/messaging.types';
import { toConversationRows } from './messageGrouping';
import { useConversation } from './useConversation';
import { useInbox } from './useInbox';
import { AgreementProposalDialog } from './components/AgreementProposalDialog';
import { MessageAttachmentItem } from './components/MessageAttachmentItem';
import { NewMessageDialog } from './components/NewMessageDialog';
import profileCss from '../profile/profile.css?inline';
import messagingCss from './messaging.css?inline';

/** The types and ceilings the server enforces, checked here only to fail before the upload. */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;

/**
 * Inbox and thread on one screen.
 *
 * The date is rendered once per calendar day and every message keeps its own time, both derived
 * from the persisted `sentAt` — never from when this client received anything.
 *
 * The open conversation lives in the URL (`?c=`), so a profile, a network row or a project
 * dashboard can land directly inside a specific thread.
 */
export const MessagesPage = () => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const inbox = useInbox();
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('c') ?? undefined;
  const thread = useConversation(openId);
  const [draft, setDraft] = useState('');
  // Which message the reporter is confirming, and which have already been filed on this screen.
  const [reporting, setReporting] = useState<string | null>(null);
  const [reported, setReported] = useState<readonly string[]>([]);
  const [conversationMuted, setConversationMuted] = useState(false);
  const [contractorMuted, setContractorMuted] = useState(false);
  const [composing, setComposing] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [actionFailed, setActionFailed] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<readonly MessageAttachment[]>([]);
  const [attachFailure, setAttachFailure] = useState<'size' | 'type' | 'upload' | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useScreenStylesheet({ id: 'profile.css', css: profileCss }, { id: 'messaging.css', css: messagingCss });
  useDocumentTitle(t.messaging.documentTitle);

  const setOpenId = useCallback(
    (id: string | undefined): void => {
      setSearchParams(id === undefined ? {} : { c: id }, { replace: false });
    },
    [setSearchParams],
  );

  // A different thread starts clean: no stale draft, upload, dialog or confirmation crosses over.
  const openIdRef = useRef<string | undefined>(openId);
  useEffect(() => {
    openIdRef.current = openId;
    setDraft('');
    setPendingAttachments([]);
    setAttachFailure(null);
    setProposing(false);
    setConfirmingDelete(null);
    setActionFailed(false);
    setSendFailure(null);
  }, [openId]);

  const locale = localeOf(lang);
  const dayLabel = (at: Date): string =>
    at.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeLabel = (iso: string): string =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const rows = useMemo(() => toConversationRows(thread.messages), [thread.messages]);
  const open = inbox.conversations.find((c) => c.id === openId);

  // Both mutes are read when a thread is opened, so the toggles show the stored state rather than
  // an assumed one. A failure leaves them off rather than claiming a mute that is not there.
  useEffect(() => {
    if (openId === undefined) return;

    let current = true;
    void fetchConversationMute(openId)
      .then((muted) => {
        if (current) setConversationMuted(muted);
      })
      .catch(() => {
        if (current) setConversationMuted(false);
      });

    const counterparty = inbox.conversations.find((c) => c.id === openId)?.counterpartyId ?? null;
    if (counterparty === null) {
      setContractorMuted(false);
      return () => {
        current = false;
      };
    }

    void fetchContractorMute(counterparty)
      .then((muted) => {
        if (current) setContractorMuted(muted);
      })
      .catch(() => {
        if (current) setContractorMuted(false);
      });

    return () => {
      current = false;
    };
  }, [openId, inbox.conversations]);

  const [sendFailure, setSendFailure] = useState<'awaiting' | 'generic' | null>(null);

  const submit = useCallback(async (): Promise<void> => {
    const body = draft.trim();
    if (body.length === 0 && pendingAttachments.length === 0) return;

    setSendFailure(null);
    try {
      await thread.send({
        ...(body.length === 0 ? {} : { body }),
        ...(pendingAttachments.length === 0
          ? {}
          : { attachments: pendingAttachments.map((attachment) => attachment.id) }),
      });
      setDraft('');
      setPendingAttachments([]);
      setAttachFailure(null);
    } catch (error) {
      // A refused send must say so: silence here is what made attachments look unsendable.
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
      setSendFailure(
        code === 'MESSAGE_REQUEST_AWAITING_RESPONSE' || code === 'MESSAGE_REQUEST_NOT_PENDING'
          ? 'awaiting'
          : 'generic',
      );
    }
  }, [draft, pendingAttachments, thread]);

  const attach = useCallback(
    async (file: File): Promise<void> => {
      if (openId === undefined) return;
      const uploadedFor = openId;

      const isImage = IMAGE_TYPES.includes(file.type);
      const isPdf = file.type === 'application/pdf';
      if (!isImage && !isPdf) {
        setAttachFailure('type');
        return;
      }
      if (file.size > (isImage ? MAX_IMAGE_BYTES : MAX_PDF_BYTES)) {
        setAttachFailure('size');
        return;
      }

      setUploading(true);
      setAttachFailure(null);
      try {
        const attachment = await uploadAttachment(uploadedFor, file);
        // A thread switch mid-upload: the result belongs to the OLD conversation and is dropped,
        // or it would ride into the new thread's send and fail as a foreign attachment.
        setPendingAttachments((previous) =>
          openIdRef.current === uploadedFor ? [...previous, attachment] : previous,
        );
      } catch {
        setAttachFailure('upload');
      } finally {
        setUploading(false);
      }
    },
    [openId],
  );

  const report = useCallback(
    async (messageId: string, reason: string): Promise<void> => {
      if (openId === undefined) return;

      // The reporter is taken from the session server-side; nothing here names them.
      await reportMessage(openId, messageId, reason);
      setReported((previous) => [...previous, messageId]);
      setReporting(null);
    },
    [openId],
  );

  const act = useCallback(async (action: Promise<void>): Promise<void> => {
    setActionFailed(false);
    try {
      await action;
    } catch {
      setActionFailed(true);
    }
  }, []);

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';

  const bubbleActions = (message: ConversationMessage) => {
    const gone = message.removed || message.deleted;
    if (gone) return null;

    return (
      <span className="msg-report">
        {message.mine && !message.kept ? (
          confirmingDelete === message.id ? (
            <>
              <span className="msg-bubble__time">{t.messaging.deleteForEveryone}</span>
              <button
                type="button"
                className="msg-report__reason"
                onClick={() => {
                  setConfirmingDelete(null);
                  void act(thread.deleteOwn(message.id));
                }}
              >
                {t.messaging.confirmDelete}
              </button>
              <button
                type="button"
                className="msg-report__reason"
                onClick={() => setConfirmingDelete(null)}
              >
                {t.messaging.cancel}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="msg-bubble__report"
              onClick={() => setConfirmingDelete(message.id)}
            >
              {t.messaging.deleteMessage}
            </button>
          )
        ) : null}

        {thread.canModerate && !message.mine && !message.kept ? (
          <button
            type="button"
            className="msg-bubble__report"
            onClick={() => void act(thread.removeForAll(message.id))}
          >
            {t.messaging.removeMessage}
          </button>
        ) : null}

        {thread.canModerate && !message.kept ? (
          <button
            type="button"
            className="msg-bubble__report"
            onClick={() => void act(thread.keep(message.id))}
          >
            {t.messaging.keepMessage}
          </button>
        ) : null}
      </span>
    );
  };

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{t.messaging.title}</h1>
            <p className="profile__sub">{t.messaging.lede}</p>
          </div>
          <div className="profile__head-actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setComposing(true)}
            >
              {t.messaging.newMessage}
            </button>
          </div>
        </header>

        {composing ? (
          <NewMessageDialog
            onClose={() => setComposing(false)}
            onOpened={(conversationId) => {
              setComposing(false);
              inbox.reload();
              setOpenId(conversationId);
            }}
          />
        ) : null}

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
                <div className="msg-thread__bar">
                  <button
                    type="button"
                    className="msg-thread__action"
                    aria-pressed={conversationMuted}
                    onClick={() =>
                      void setConversationMute(openId, !conversationMuted).then(setConversationMuted)
                    }
                  >
                    {conversationMuted ? t.messaging.unmuteConversation : t.messaging.muteConversation}
                  </button>

                  {open?.counterpartyId == null ? null : (
                    <button
                      type="button"
                      className="msg-thread__action"
                      aria-pressed={contractorMuted}
                      onClick={() =>
                        void setContractorMute(open.counterpartyId as string, !contractorMuted).then(
                          setContractorMuted,
                        )
                      }
                    >
                      {contractorMuted ? t.messaging.unmuteContractor : t.messaging.muteContractor}
                    </button>
                  )}

                  {thread.canProposeAgreement ? (
                    <button
                      type="button"
                      className="msg-thread__action"
                      onClick={() => setProposing(true)}
                    >
                      {t.messaging.proposeAgreement}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="msg-thread__action"
                    onClick={() => void inbox.hide(openId).then(() => setOpenId(undefined))}
                  >
                    {t.messaging.deleteChat}
                  </button>
                </div>

                {proposing ? (
                  <AgreementProposalDialog
                    busyExternally={thread.sending}
                    onClose={() => setProposing(false)}
                    onPropose={thread.propose}
                  />
                ) : null}

                {actionFailed ? (
                  <p className="msg-dialog__error" role="alert">{t.messaging.actionFailed}</p>
                ) : null}

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

                        {row.message.deleted ? (
                          <span className="msg-bubble__body msg-bubble__removed">
                            {row.message.senderName.trim().length > 0
                              ? t.messaging.deletedByMessage.replace('{name}', row.message.senderName)
                              : t.messaging.deletedMessage}
                          </span>
                        ) : row.message.removed ? (
                          <span className="msg-bubble__body msg-bubble__removed">
                            {row.message.removedByRole !== null &&
                            row.message.removedByRole in t.messaging.removedByRoles
                              ? t.messaging.removedByRoleMessage.replace(
                                  '{role}',
                                  t.messaging.removedByRoles[
                                    row.message.removedByRole as keyof typeof t.messaging.removedByRoles
                                  ],
                                )
                              : t.messaging.removedMessage}
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
                          <>
                            {row.message.body === null ? null : (
                              <span className="msg-bubble__body">{row.message.body}</span>
                            )}
                            {row.message.attachments.map((attachment) => (
                              <MessageAttachmentItem
                                key={attachment.id}
                                conversationId={openId}
                                attachment={attachment}
                              />
                            ))}
                          </>
                        )}

                        {row.message.kept ? (
                          <span className="msg-bubble__kept">{t.messaging.keptBadge}</span>
                        ) : null}

                        <time className="msg-bubble__time" dateTime={row.message.sentAt}>
                          {timeLabel(row.message.sentAt)}
                        </time>

                        {bubbleActions(row.message)}

                        {row.message.mine ||
                        row.message.removed ||
                        row.message.deleted ? null : reported.includes(row.message.id) ? (
                          <span className="msg-bubble__time">{t.messaging.reported}</span>
                        ) : reporting === row.message.id ? (
                          <span className="msg-report">
                            {(['spam', 'harassment', 'impersonation', 'other'] as const).map(
                              (reason) => (
                                <button
                                  key={reason}
                                  type="button"
                                  className="msg-report__reason"
                                  onClick={() => void report(row.message.id, reason)}
                                >
                                  {t.messaging.reportReasons[reason]}
                                </button>
                              ),
                            )}
                            <button
                              type="button"
                              className="msg-report__reason"
                              onClick={() => setReporting(null)}
                            >
                              {t.messaging.cancel}
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="msg-bubble__report"
                            onClick={() => setReporting(row.message.id)}
                          >
                            {t.messaging.report}
                          </button>
                        )}
                      </div>
                    ),
                  )}
                </div>

                {sendFailure !== null ? (
                  <p className="msg-dialog__error msg-composer__notice" role="alert">
                    {sendFailure === 'awaiting'
                      ? t.messaging.sendAwaitingRequest
                      : t.messaging.sendFailed}
                  </p>
                ) : null}

                {attachFailure !== null ? (
                  <p className="msg-dialog__error msg-composer__notice" role="alert">
                    {attachFailure === 'size'
                      ? t.messaging.attachTooLarge
                      : attachFailure === 'type'
                        ? t.messaging.attachUnsupported
                        : t.messaging.attachFailed}
                  </p>
                ) : null}

                {pendingAttachments.length > 0 ? (
                  <div className="msg-composer__pending">
                    {pendingAttachments.map((attachment) => (
                      <span key={attachment.id} className="msg-attachment__file">
                        <span className="msg-attachment__name" dir="ltr">{attachment.filename}</span>
                        <button
                          type="button"
                          className="msg-bubble__report"
                          onClick={() =>
                            setPendingAttachments((previous) =>
                              previous.filter((pending) => pending.id !== attachment.id),
                            )
                          }
                        >
                          {t.messaging.attachRemove}
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                {open?.requestState === 'pending' ? (
                  <p className="msg-empty">
                    {open.awaitingMyAnswer
                      ? t.messaging.requestAnswerFirst
                      : t.messaging.requestPendingNotice}
                  </p>
                ) : null}

                <div className="msg-composer">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file !== undefined) void attach(file);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => fileInput.current?.click()}
                    disabled={uploading}
                  >
                    {t.messaging.attach}
                    {uploading ? <ButtonSpinner /> : null}
                  </button>
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
                    disabled={
                      thread.sending ||
                      uploading ||
                      (draft.trim().length === 0 && pendingAttachments.length === 0)
                    }
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
