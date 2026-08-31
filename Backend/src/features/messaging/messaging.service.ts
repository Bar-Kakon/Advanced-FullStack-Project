import { Types } from 'mongoose';

import type { BlockRepository } from '../blocks/block.repository.js';
import type { NotificationDispatchService } from '../notifications/notificationDispatch.service.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { ProjectRepository } from '../projects/project.repository.js';
import type { UserRepository } from '../users/user.repository.js';
import type { ConversationRecord } from './conversation.model.js';
import type { AgreementRecord, MessageRecord } from './message.model.js';
import {
  agreementAlreadyBecameTask,
  agreementNotPending,
  cannotAnswerOwnAgreement,
  cannotMessageSelf,
  conversationNotFound,
  messageNotFound,
  noContactWithUser,
  requestAwaitingResponse,
  requestNotPending,
  requestNotYours,
} from './messaging.errors.js';
import { encodeCursor, type MessagingRepository } from './messaging.repository.js';

export interface ConversationSummaryDto {
  readonly id: string;
  readonly kind: 'direct' | 'project_room';
  readonly title: string;
  readonly counterpartyId: string | null;
  readonly projectId: string | null;
  readonly requestState: string | null;
  readonly awaitingMyAnswer: boolean;
  readonly lastMessageAt: string | null;
}

export interface MessageDto {
  readonly id: string;
  readonly senderId: string;
  readonly senderName: string;
  readonly mine: boolean;
  readonly kind: 'text' | 'agreement';
  readonly body: string | null;
  readonly removed: boolean;
  readonly agreement: {
    readonly title: string;
    readonly description: string | null;
    readonly startDate: string;
    readonly dueDate: string;
    readonly state: string;
    readonly taskId: string | null;
    readonly mine: boolean;
  } | null;
  /** The persisted send time, in ISO 8601. Every clock the client renders derives from this. */
  readonly sentAt: string;
}

export interface HistoryPageDto {
  readonly messages: readonly MessageDto[];
  readonly nextCursor: string | null;
}

export interface InboxPageDto {
  readonly conversations: readonly ConversationSummaryDto[];
  readonly nextCursor: string | null;
}

export interface MessagingService {
  inbox(userId: string, folder: 'inbox' | 'requests', limit: number, cursor?: string): Promise<InboxPageDto>;
  startDirect(userId: string, otherUserId: string, body: string): Promise<ConversationSummaryDto>;
  send(userId: string, conversationId: string, body: string): Promise<MessageDto>;
  history(userId: string, conversationId: string, limit: number, cursor?: string): Promise<HistoryPageDto>;
  answerRequest(userId: string, conversationId: string, accept: boolean): Promise<void>;
  hide(userId: string, conversationId: string): Promise<void>;
  projectRoom(userId: string, projectId: string): Promise<ConversationSummaryDto>;
  proposeAgreement(userId: string, conversationId: string, input: AgreementInput): Promise<MessageDto>;
  answerAgreement(userId: string, conversationId: string, messageId: string, accept: boolean): Promise<MessageDto>;
  /** Resolves a conversation the caller may read, or answers as though it were not there. */
  reachable(userId: string, conversationId: string): Promise<ConversationRecord>;
}

export interface AgreementInput {
  readonly title: string;
  readonly description?: string;
  readonly startDate: string;
  readonly dueDate: string;
  readonly projectId?: string;
}

/** Creates the canonical Task from an accepted agreement. The task domain owns the schema. */
export interface AgreementTaskPort {
  create(input: {
    creatorId: string;
    assigneeId: string;
    title: string;
    description?: string;
    startDate: string;
    dueDate: string;
    projectId?: string;
  }): Promise<Types.ObjectId>;
}

export interface MessagingDependencies {
  readonly conversations: MessagingRepository;
  readonly users: UserRepository;
  readonly blocks: BlockRepository;
  readonly access: ProjectAccessRepository;
  readonly projects: ProjectRepository;
  readonly notifications: NotificationDispatchService;
  readonly tasks: AgreementTaskPort;
}

export const createMessagingService = ({
  conversations,
  users,
  blocks,
  access,
  projects,
  notifications,
  tasks,
}: MessagingDependencies): MessagingService => {
  const nameOf = async (id: Types.ObjectId): Promise<string> =>
    (await users.findDisplayNames([id])).get(id.toString()) ?? '';

  const namesFor = async (ids: readonly Types.ObjectId[]): Promise<Map<string, string>> =>
    users.findDisplayNames([...new Set(ids.map((id) => id.toString()))].map((id) => new Types.ObjectId(id)));

  /**
   * Project Room access is the project's own answer, read live.
   *
   * An ACTIVE membership and nothing else: somebody invited but not yet accepted is not a
   * participant, and a removed member stops being one the moment their membership ends. A
   * confidential delegate is deliberately not a project member, so this is also the wall that
   * keeps delegation out of the room entirely.
   */
  const participatesInProject = async (
    userId: string,
    project: Types.ObjectId,
  ): Promise<boolean> =>
    (await access.findActiveMembership(project, new Types.ObjectId(userId))) !== null;

  const mayRead = async (userId: string, conversation: ConversationRecord): Promise<boolean> => {
    if (conversation.kind === 'project_room') {
      return conversation.project !== undefined
        ? participatesInProject(userId, conversation.project)
        : false;
    }

    return conversation.participants.some((participant) => participant.toString() === userId);
  };

  const reachable = async (userId: string, conversationId: string): Promise<ConversationRecord> => {
    const conversation = await conversations.findById(conversationId);
    if (conversation === null) throw conversationNotFound();
    if (!(await mayRead(userId, conversation))) throw conversationNotFound();

    return conversation;
  };

  const counterpartyOf = (conversation: ConversationRecord, userId: string): Types.ObjectId | null =>
    conversation.participants.find((participant) => participant.toString() !== userId) ?? null;

  const toSummary = async (
    conversation: ConversationRecord,
    userId: string,
    projectNames: Map<string, string>,
  ): Promise<ConversationSummaryDto> => {
    const counterparty = counterpartyOf(conversation, userId);

    return {
      id: conversation._id.toString(),
      kind: conversation.kind,
      title:
        conversation.kind === 'project_room'
          ? projectNames.get(conversation.project?.toString() ?? '') ?? ''
          : counterparty === null
            ? ''
            : await nameOf(counterparty),
      counterpartyId: counterparty?.toString() ?? null,
      projectId: conversation.project?.toString() ?? null,
      requestState: conversation.request?.state ?? null,
      awaitingMyAnswer:
        conversation.request?.state === 'pending' &&
        conversation.request.requestedBy.toString() !== userId,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    };
  };

  /**
   * A removed message keeps its place and its time, and is represented neutrally: the body is
   * withheld rather than the row disappearing, so the thread does not silently reshape itself.
   */
  const toMessageDto = (
    message: MessageRecord,
    userId: string,
    names: Map<string, string>,
  ): MessageDto => {
    const removed = message.removedAt !== undefined;
    const agreement: AgreementRecord | undefined = message.agreement;

    return {
      id: message._id.toString(),
      senderId: message.sender.toString(),
      senderName: names.get(message.sender.toString()) ?? '',
      mine: message.sender.toString() === userId,
      kind: message.kind,
      body: removed ? null : message.body ?? null,
      removed,
      agreement:
        agreement === undefined || removed
          ? null
          : {
              title: agreement.title,
              description: agreement.description ?? null,
              startDate: agreement.startDate,
              dueDate: agreement.dueDate,
              state: agreement.state,
              taskId: agreement.task?.toString() ?? null,
              mine: message.sender.toString() === userId,
            },
      sentAt: message.createdAt.toISOString(),
    };
  };

  /**
   * Whether these two may hold a PRIVATE conversation. No-contact is a direct-message rule and is
   * asked here and nowhere else, so it can never reach a Project Room the two still share.
   */
  const noContactBetween = async (a: string, b: string): Promise<boolean> => {
    const hidden = await blocks.findHiddenUserIds(a);
    return hidden.some((id: Types.ObjectId) => id.toString() === b);
  };

  const announce = async (
    conversation: ConversationRecord,
    senderId: string,
    type: 'message.received' | 'message.request_received' | 'agreement.received' | 'agreement.answered',
    dedupeKey: string,
  ): Promise<void> => {
    const actorName = await nameOf(new Types.ObjectId(senderId));

    const recipients =
      conversation.kind === 'project_room' && conversation.project !== undefined
        ? (await access.listMembers(conversation.project))
            .filter((member) => member.status === 'active')
            .map((member) => member.user)
        : conversation.participants;

    // No message body reaches a notification: the payload has no free-text field at all.
    await notifications.emitMany(
      recipients
        .filter((recipient) => recipient.toString() !== senderId)
        .map((recipient) => ({
          userId: recipient,
          type,
          ...(conversation.project === undefined ? {} : { projectId: conversation.project }),
          payload: { actorName },
          dedupeKey: `${dedupeKey}:${recipient.toString()}`,
        })),
    );
  };

  return {
    reachable,

    async inbox(userId, folder, limit, cursor) {
      const me = new Types.ObjectId(userId);
      const direct = await conversations.listForUser(me, folder, { limit, ...(cursor === undefined ? {} : { cursor }) });

      // Project rooms are listed from live membership rather than from a participants array, so a
      // person who left a project stops seeing its room without anything being rewritten.
      const rooms =
        folder === 'inbox'
          ? await conversations.listProjectRooms(await access.listActiveProjectIdsForUser(me))
          : [];

      const all = [...direct, ...rooms]
        .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0))
        .slice(0, limit);

      const projectIds = all.flatMap((row) => (row.project === undefined ? [] : [row.project]));
      const projectNames = new Map(
        (await projects.listByIds(projectIds)).map((row) => [row._id.toString(), row.name]),
      );

      const last = all.at(-1);

      return {
        conversations: await Promise.all(all.map((row) => toSummary(row, userId, projectNames))),
        nextCursor:
          last !== undefined && direct.length === limit && last.lastMessageAt !== undefined
            ? encodeCursor(last.lastMessageAt, last._id)
            : null,
      };
    },

    /**
     * First contact. A connection is NOT consulted: whether these two are connected has no bearing
     * on whether a first message may be sent, only on nothing at all. What decides is whether a
     * conversation already exists — if not, the message opens a REQUEST.
     */
    async startDirect(userId, otherUserId, body) {
      if (userId === otherUserId) throw cannotMessageSelf();
      if (!Types.ObjectId.isValid(otherUserId)) throw conversationNotFound();

      if ((await noContactBetween(userId, otherUserId)) || (await noContactBetween(otherUserId, userId))) {
        throw noContactWithUser();
      }

      const me = new Types.ObjectId(userId);
      const them = new Types.ObjectId(otherUserId);

      const existing = await conversations.findDirectByPair(me, them);
      // The same pair never gets a second conversation, whatever either side hid.
      const conversation = existing ?? (await conversations.createDirect(me, them, 'pending'));

      if (conversation.request?.state === 'pending' && conversation.request.requestedBy.toString() !== userId) {
        throw requestAwaitingResponse();
      }

      const sentAt = new Date();
      await conversations.appendMessage({
        conversation: conversation._id,
        sender: me,
        kind: 'text',
        body,
      });
      await conversations.touchAndReveal(conversation._id, sentAt);

      await announce(
        conversation,
        userId,
        conversation.request?.state === 'pending' ? 'message.request_received' : 'message.received',
        `message:${conversation._id.toString()}:${sentAt.getTime()}`,
      );

      const refreshed = (await conversations.findById(conversation._id.toString())) ?? conversation;
      return toSummary(refreshed, userId, new Map());
    },

    async send(userId, conversationId, body) {
      const conversation = await reachable(userId, conversationId);

      if (conversation.kind === 'direct') {
        const counterparty = counterpartyOf(conversation, userId);
        if (counterparty !== null) {
          const other = counterparty.toString();
          if ((await noContactBetween(userId, other)) || (await noContactBetween(other, userId))) {
            throw noContactWithUser();
          }
        }

        // The requester may not keep writing while the request is unanswered.
        if (
          conversation.request?.state === 'pending' &&
          conversation.request.requestedBy.toString() === userId
        ) {
          const already = await conversations.history(conversation._id, { limit: 1 });
          if (already.length > 0) throw requestAwaitingResponse();
        }

        if (
          conversation.request?.state === 'pending' &&
          conversation.request.requestedBy.toString() !== userId
        ) {
          throw requestNotPending();
        }
      }

      const sentAt = new Date();
      const message = await conversations.appendMessage({
        conversation: conversation._id,
        sender: new Types.ObjectId(userId),
        kind: 'text',
        body,
      });

      // Clears every hide, so a thread the other side deleted returns with all of its history.
      await conversations.touchAndReveal(conversation._id, sentAt);
      await announce(
        conversation,
        userId,
        'message.received',
        `message:${message._id.toString()}`,
      );

      return toMessageDto(message, userId, await namesFor([message.sender]));
    },

    async history(userId, conversationId, limit, cursor) {
      const conversation = await reachable(userId, conversationId);

      const rows = await conversations.history(conversation._id, {
        limit,
        ...(cursor === undefined ? {} : { cursor }),
      });
      await conversations.markRead(conversation._id, new Types.ObjectId(userId));

      const names = await namesFor(rows.map((row) => row.sender));
      const last = rows.at(-1);

      return {
        // Oldest first within the page, which is the order a conversation reads in.
        messages: rows
          .slice()
          .reverse()
          .map((row) => toMessageDto(row, userId, names)),
        nextCursor:
          last !== undefined && rows.length === limit ? encodeCursor(last.createdAt, last._id) : null,
      };
    },

    async answerRequest(userId, conversationId, accept) {
      const conversation = await reachable(userId, conversationId);
      if (conversation.request?.state !== 'pending') throw requestNotPending();
      if (conversation.request.requestedBy.toString() === userId) throw requestNotYours();

      if (!(await conversations.setRequestState(conversation._id, accept ? 'accepted' : 'declined'))) {
        throw requestNotPending();
      }
    },

    /**
     * "Delete this chat" — a per-user hide, and nothing else. No message is touched, the other
     * participant's view is unchanged, and the next message in either direction restores it whole.
     */
    async hide(userId, conversationId) {
      const conversation = await reachable(userId, conversationId);
      await conversations.hideFor(conversation._id, new Types.ObjectId(userId));
    },

    async projectRoom(userId, projectId) {
      if (!Types.ObjectId.isValid(projectId)) throw conversationNotFound();
      const project = new Types.ObjectId(projectId);

      if (!(await participatesInProject(userId, project))) throw conversationNotFound();

      const room =
        (await conversations.findProjectRoom(project)) ??
        (await conversations.createProjectRoom(project));

      const [found] = await projects.listByIds([project]);

      return toSummary(
        room,
        userId,
        new Map(found === undefined ? [] : [[project.toString(), found.name]]),
      );
    },

    async proposeAgreement(userId, conversationId, input) {
      const conversation = await reachable(userId, conversationId);

      const sentAt = new Date();
      const message = await conversations.appendMessage({
        conversation: conversation._id,
        sender: new Types.ObjectId(userId),
        kind: 'agreement',
        agreement: {
          title: input.title,
          ...(input.description === undefined ? {} : { description: input.description }),
          startDate: input.startDate,
          dueDate: input.dueDate,
          ...(input.projectId === undefined ? {} : { project: new Types.ObjectId(input.projectId) }),
          state: 'proposed',
        },
      });

      await conversations.touchAndReveal(conversation._id, sentAt);
      await announce(conversation, userId, 'agreement.received', `agreement:${message._id.toString()}`);

      return toMessageDto(message, userId, await namesFor([message.sender]));
    },

    /**
     * Acceptance is the approved point at which work exists, and it creates the canonical Task
     * exactly once — the repository's filter on `proposed` is what makes a double click impossible
     * rather than merely unlikely.
     */
    async answerAgreement(userId, conversationId, messageId, accept) {
      const conversation = await reachable(userId, conversationId);

      const message = await conversations.findMessage(messageId);
      if (
        message === null ||
        message.conversation.toString() !== conversation._id.toString() ||
        message.kind !== 'agreement' ||
        message.agreement === undefined
      ) {
        throw messageNotFound();
      }

      if (message.agreement.state !== 'proposed') throw agreementNotPending();
      if (message.sender.toString() === userId) throw cannotAnswerOwnAgreement();
      if (message.agreement.task !== undefined) throw agreementAlreadyBecameTask();

      let task: Types.ObjectId | undefined;
      if (accept) {
        task = await tasks.create({
          // The proposer commits the work; the party accepting performs it.
          creatorId: message.sender.toString(),
          assigneeId: userId,
          title: message.agreement.title,
          ...(message.agreement.description === undefined
            ? {}
            : { description: message.agreement.description }),
          startDate: message.agreement.startDate,
          dueDate: message.agreement.dueDate,
          ...(message.agreement.project === undefined
            ? {}
            : { projectId: message.agreement.project.toString() }),
        });
      }

      const answered = await conversations.answerAgreement(
        message._id,
        new Types.ObjectId(userId),
        accept ? 'accepted' : 'declined',
        task,
      );
      if (answered === null) throw agreementNotPending();

      await announce(
        conversation,
        userId,
        'agreement.answered',
        `agreement-answer:${message._id.toString()}`,
      );

      return toMessageDto(answered, userId, await namesFor([answered.sender]));
    },
  };
};
