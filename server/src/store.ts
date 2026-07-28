import { randomUUID } from 'node:crypto';
import type { ChatMessage, ChatSession, PublicUser } from './types.js';

const AVATAR_COLORS = [
  '#f97316', '#ef4444', '#22c55e', '#3b82f6', '#a855f7',
  '#ec4899', '#14b8a6', '#eab308', '#6366f1', '#84cc16',
];

const MAX_MESSAGES_PER_SESSION = 500;

interface UserRecord {
  id: string;
  name: string;
  color: string;
  socketId: string | null;
}

interface SessionRecord {
  id: string;
  name: string | null;
  participantIds: string[];
  messages: ChatMessage[];
  createdAt: number;
}

export class ChatStore {
  private clientIdToUserId = new Map<string, string>();
  private users = new Map<string, UserRecord>();
  private socketIdToUserId = new Map<string, string>();
  private sessions = new Map<string, SessionRecord>();
  private sessionKeyIndex = new Map<string, string>();

  private nextColor(): string {
    return AVATAR_COLORS[this.users.size % AVATAR_COLORS.length];
  }

  toPublicUser(userId: string): PublicUser | undefined {
    const u = this.users.get(userId);
    if (!u) return undefined;
    return { id: u.id, name: u.name, color: u.color, online: u.socketId !== null };
  }

  join(clientId: string, name: string, socketId: string): UserRecord {
    let userId = this.clientIdToUserId.get(clientId);
    if (!userId || !this.users.has(userId)) {
      userId = randomUUID();
      this.clientIdToUserId.set(clientId, userId);
      this.users.set(userId, { id: userId, name, color: this.nextColor(), socketId });
    } else {
      const record = this.users.get(userId)!;
      record.name = name;
      record.socketId = socketId;
    }
    this.socketIdToUserId.set(socketId, userId);
    return this.users.get(userId)!;
  }

  disconnect(socketId: string): string | undefined {
    const userId = this.socketIdToUserId.get(socketId);
    if (!userId) return undefined;
    const record = this.users.get(userId);
    if (record && record.socketId === socketId) {
      record.socketId = null;
    }
    this.socketIdToUserId.delete(socketId);
    return userId;
  }

  getUserIdBySocket(socketId: string): string | undefined {
    return this.socketIdToUserId.get(socketId);
  }

  getOnlineUsers(): PublicUser[] {
    return [...this.users.values()]
      .filter((u) => u.socketId !== null)
      .map((u) => this.toPublicUser(u.id)!);
  }

  getSocketIdsForUsers(userIds: string[]): string[] {
    return userIds
      .map((id) => this.users.get(id)?.socketId)
      .filter((s): s is string => !!s);
  }

  sessionsForUser(userId: string): ChatSession[] {
    return [...this.sessions.values()]
      .filter((s) => s.participantIds.includes(userId))
      .map((s) => this.toChatSession(s));
  }

  private toChatSession(s: SessionRecord): ChatSession {
    return {
      id: s.id,
      name: s.name,
      participantIds: s.participantIds,
      participants: s.participantIds
        .map((id) => this.toPublicUser(id))
        .filter((u): u is PublicUser => !!u),
      messages: s.messages,
      createdAt: s.createdAt,
    };
  }

  getSession(sessionId: string): ChatSession | undefined {
    const s = this.sessions.get(sessionId);
    return s ? this.toChatSession(s) : undefined;
  }

  isParticipant(sessionId: string, userId: string): boolean {
    return this.sessions.get(sessionId)?.participantIds.includes(userId) ?? false;
  }

  createOrGetSession(creatorId: string, participantIds: string[], name?: string):
    { session: ChatSession; created: boolean } {
    const uniqueIds = [...new Set([creatorId, ...participantIds])].filter((id) =>
      this.users.has(id),
    );
    const key = [...uniqueIds].sort().join(',');

    const existingId = this.sessionKeyIndex.get(key);
    if (existingId) {
      const existing = this.sessions.get(existingId)!;
      return { session: this.toChatSession(existing), created: false };
    }

    const id = randomUUID();
    const record: SessionRecord = {
      id,
      name: name?.trim() || null,
      participantIds: uniqueIds,
      messages: [],
      createdAt: Date.now(),
    };
    this.sessions.set(id, record);
    this.sessionKeyIndex.set(key, id);
    return { session: this.toChatSession(record), created: true };
  }

  addMessage(sessionId: string, fromUserId: string, text: string): ChatMessage | undefined {
    const session = this.sessions.get(sessionId);
    const from = this.toPublicUser(fromUserId);
    if (!session || !from) return undefined;

    const message: ChatMessage = {
      id: randomUUID(),
      sessionId,
      from,
      text,
      timestamp: Date.now(),
    };
    session.messages.push(message);
    if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
      session.messages.splice(0, session.messages.length - MAX_MESSAGES_PER_SESSION);
    }
    return message;
  }

  editMessage(
    sessionId: string,
    messageId: string,
    userId: string,
    text: string,
  ): ChatMessage | undefined {
    const session = this.sessions.get(sessionId);
    const message = session?.messages.find((m) => m.id === messageId);
    if (!message || message.from.id !== userId || message.deletedAt) return undefined;

    message.text = text;
    message.editedAt = Date.now();
    return message;
  }

  deleteMessage(sessionId: string, messageId: string, userId: string): ChatMessage | undefined {
    const session = this.sessions.get(sessionId);
    const message = session?.messages.find((m) => m.id === messageId);
    if (!message || message.from.id !== userId || message.deletedAt) return undefined;

    message.text = '';
    message.deletedAt = Date.now();
    return message;
  }
}
