export interface PublicUser {
  id: string;
  name: string;
  color: string;
  online: boolean;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  from: PublicUser;
  text: string;
  timestamp: number;
  editedAt?: number;
  deletedAt?: number;
}

export interface ChatSession {
  id: string;
  name: string | null;
  participantIds: string[];
  participants: PublicUser[];
  messages: ChatMessage[];
  createdAt: number;
}

export interface JoinPayload {
  name: string;
  clientId: string;
}

export interface JoinAck {
  ok: boolean;
  error?: string;
  user?: PublicUser;
  onlineUsers?: PublicUser[];
  sessions?: ChatSession[];
}

export interface CreateSessionPayload {
  participantIds: string[];
  name?: string;
}

export interface CreateSessionAck {
  ok: boolean;
  error?: string;
  session?: ChatSession;
}

export interface SendMessagePayload {
  sessionId: string;
  text: string;
}

export interface TypingPayload {
  sessionId: string;
  isTyping: boolean;
}

export interface TypingEvent {
  sessionId: string;
  userId: string;
  isTyping: boolean;
}

export interface EditMessagePayload {
  sessionId: string;
  messageId: string;
  text: string;
}

export interface EditMessageAck {
  ok: boolean;
  error?: string;
  message?: ChatMessage;
}

export interface DeleteMessagePayload {
  sessionId: string;
  messageId: string;
}

export interface DeleteMessageAck {
  ok: boolean;
  error?: string;
}

export interface DeleteMessageEvent {
  sessionId: string;
  messageId: string;
}
