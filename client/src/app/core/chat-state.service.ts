import { Injectable, computed, inject, signal } from '@angular/core';
import { SocketService } from './socket.service';
import { Attachment, ChatMessage, ChatSession, PublicUser } from './models';
import { generateId } from './utils';

const CLIENT_ID_KEY = 'lan-webchat:client-id';
const DISPLAY_NAME_KEY = 'lan-webchat:display-name';
const TYPING_TIMEOUT_MS = 3000;

function readOrCreateClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = generateId();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

@Injectable({ providedIn: 'root' })
export class ChatStateService {
  private socket = inject(SocketService);
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly currentUser = signal<PublicUser | null>(null);
  readonly onlineUsers = signal<PublicUser[]>([]);
  readonly sessions = signal<ChatSession[]>([]);
  readonly activeSessionId = signal<string | null>(null);
  readonly unreadBySession = signal<Record<string, number>>({});
  readonly typingBySession = signal<Record<string, PublicUser[]>>({});
  readonly connectionError = signal<string | null>(null);
  readonly connecting = signal<boolean>(false);

  readonly otherOnlineUsers = computed(() =>
    this.onlineUsers().filter((u) => u.id !== this.currentUser()?.id),
  );

  readonly activeSession = computed(
    () => this.sessions().find((s) => s.id === this.activeSessionId()) ?? null,
  );

  readonly sortedSessions = computed(() =>
    [...this.sessions()].sort((a, b) => {
      const aLast = a.messages.at(-1)?.timestamp ?? a.createdAt;
      const bLast = b.messages.at(-1)?.timestamp ?? b.createdAt;
      return bLast - aLast;
    }),
  );

  get savedDisplayName(): string {
    return localStorage.getItem(DISPLAY_NAME_KEY) ?? '';
  }

  constructor() {
    this.socket.onPresenceUpdate((users) => this.onlineUsers.set(users));
    this.socket.onSessionCreated((session) => this.upsertSession(session));
    this.socket.onSessionMessage((message) => this.handleIncomingMessage(message));
    this.socket.onMessageEdited((message) => this.handleEditedMessage(message));
    this.socket.onMessageDeleted((event) => this.handleDeletedMessage(event));
    this.socket.onTyping((event) => this.handleTypingEvent(event));
    this.socket.onDisconnect(() => this.connectionError.set('Disconnected from server. Reconnecting...'));
    this.socket.onConnect(() => this.connectionError.set(null));
  }

  async join(name: string): Promise<{ ok: boolean; error?: string }> {
    this.connecting.set(true);
    this.connectionError.set(null);
    this.socket.connect();

    const clientId = readOrCreateClientId();
    const ack = await this.socket.join({ name, clientId });
    this.connecting.set(false);

    if (!ack.ok || !ack.user) {
      this.connectionError.set(ack.error ?? 'Failed to join.');
      return { ok: false, error: ack.error };
    }

    localStorage.setItem(DISPLAY_NAME_KEY, name);
    this.currentUser.set(ack.user);
    this.onlineUsers.set(ack.onlineUsers ?? []);
    this.sessions.set(ack.sessions ?? []);
    return { ok: true };
  }

  async createSession(participantIds: string[], name?: string): Promise<ChatSession | null> {
    const ack = await this.socket.createSession({ participantIds, name });
    if (!ack.ok || !ack.session) {
      this.connectionError.set(ack.error ?? 'Failed to create chat.');
      return null;
    }
    this.upsertSession(ack.session);
    this.selectSession(ack.session.id);
    return ack.session;
  }

  sendMessage(text: string, attachment?: Attachment): void {
    const sessionId = this.activeSessionId();
    const trimmed = text.trim();
    if (!sessionId || (!trimmed && !attachment)) return;
    this.socket.sendMessage({ sessionId, text: trimmed, attachment });
    this.setTyping(false);
  }

  async uploadFile(file: File): Promise<{ ok: boolean; attachment?: Attachment; error?: string }> {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        return { ok: false, error: body.error ?? 'Upload failed.' };
      }
      return { ok: true, attachment: body.attachment };
    } catch {
      return { ok: false, error: 'Upload failed. Check your connection.' };
    }
  }

  async editMessage(messageId: string, text: string): Promise<{ ok: boolean; error?: string }> {
    const sessionId = this.activeSessionId();
    const trimmed = text.trim();
    if (!sessionId || !trimmed) return { ok: false };

    const ack = await this.socket.editMessage({ sessionId, messageId, text: trimmed });
    return { ok: ack.ok, error: ack.error };
  }

  async deleteMessage(messageId: string): Promise<{ ok: boolean; error?: string }> {
    const sessionId = this.activeSessionId();
    if (!sessionId) return { ok: false };

    const ack = await this.socket.deleteMessage({ sessionId, messageId });
    return { ok: ack.ok, error: ack.error };
  }

  selectSession(sessionId: string): void {
    this.activeSessionId.set(sessionId);
    this.unreadBySession.update((map) => ({ ...map, [sessionId]: 0 }));
  }

  setTyping(isTyping: boolean): void {
    const sessionId = this.activeSessionId();
    if (!sessionId) return;
    this.socket.setTyping({ sessionId, isTyping });
  }

  sessionDisplayName(session: ChatSession): string {
    if (session.name) return session.name;
    const others = session.participants.filter((p) => p.id !== this.currentUser()?.id);
    if (others.length === 0) return 'Just you';
    return others.map((p) => p.name).join(', ');
  }

  private upsertSession(session: ChatSession): void {
    this.sessions.update((sessions) => {
      const idx = sessions.findIndex((s) => s.id === session.id);
      if (idx === -1) return [...sessions, session];
      const next = [...sessions];
      next[idx] = session;
      return next;
    });
  }

  private handleIncomingMessage(message: ChatMessage): void {
    this.sessions.update((sessions) =>
      sessions.map((s) =>
        s.id === message.sessionId ? { ...s, messages: [...s.messages, message] } : s,
      ),
    );

    const isOwnMessage = message.from.id === this.currentUser()?.id;
    const isActive = this.activeSessionId() === message.sessionId;
    if (!isOwnMessage && !isActive) {
      this.unreadBySession.update((map) => ({
        ...map,
        [message.sessionId]: (map[message.sessionId] ?? 0) + 1,
      }));
    }

    this.typingBySession.update((map) => ({
      ...map,
      [message.sessionId]: (map[message.sessionId] ?? []).filter(
        (u) => u.id !== message.from.id,
      ),
    }));
  }

  private handleEditedMessage(message: ChatMessage): void {
    this.sessions.update((sessions) =>
      sessions.map((s) =>
        s.id === message.sessionId
          ? { ...s, messages: s.messages.map((m) => (m.id === message.id ? message : m)) }
          : s,
      ),
    );
  }

  private handleDeletedMessage(event: { sessionId: string; messageId: string }): void {
    this.sessions.update((sessions) =>
      sessions.map((s) =>
        s.id === event.sessionId
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.id === event.messageId ? { ...m, text: '', deletedAt: Date.now() } : m,
              ),
            }
          : s,
      ),
    );
  }

  private handleTypingEvent(event: { sessionId: string; userId: string; isTyping: boolean }): void {
    const user = this.onlineUsers().find((u) => u.id === event.userId);
    if (!user) return;

    const timerKey = `${event.sessionId}:${event.userId}`;
    const existingTimer = this.typingTimers.get(timerKey);
    if (existingTimer) clearTimeout(existingTimer);

    this.typingBySession.update((map) => {
      const current = map[event.sessionId] ?? [];
      const withoutUser = current.filter((u) => u.id !== event.userId);
      return {
        ...map,
        [event.sessionId]: event.isTyping ? [...withoutUser, user] : withoutUser,
      };
    });

    if (event.isTyping) {
      const timer = setTimeout(() => {
        this.typingBySession.update((map) => ({
          ...map,
          [event.sessionId]: (map[event.sessionId] ?? []).filter((u) => u.id !== event.userId),
        }));
      }, TYPING_TIMEOUT_MS);
      this.typingTimers.set(timerKey, timer);
    }
  }
}
