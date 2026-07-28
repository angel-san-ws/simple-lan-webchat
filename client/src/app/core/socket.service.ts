import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import {
  ChatMessage,
  ChatSession,
  CreateSessionAck,
  CreateSessionPayload,
  DeleteMessageAck,
  DeleteMessageEvent,
  DeleteMessagePayload,
  EditMessageAck,
  EditMessagePayload,
  JoinAck,
  JoinPayload,
  PublicUser,
  SendMessagePayload,
  TypingEvent,
  TypingPayload,
} from './models';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket = io({ autoConnect: false, transports: ['websocket', 'polling'] });

  connect(): void {
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  get connected(): boolean {
    return this.socket.connected;
  }

  onConnect(cb: () => void): void {
    this.socket.on('connect', cb);
  }

  onDisconnect(cb: () => void): void {
    this.socket.on('disconnect', cb);
  }

  join(payload: JoinPayload): Promise<JoinAck> {
    return new Promise((resolve) => this.socket.emit('user:join', payload, resolve));
  }

  createSession(payload: CreateSessionPayload): Promise<CreateSessionAck> {
    return new Promise((resolve) => this.socket.emit('session:create', payload, resolve));
  }

  sendMessage(payload: SendMessagePayload): void {
    this.socket.emit('session:message', payload);
  }

  setTyping(payload: TypingPayload): void {
    this.socket.emit('session:typing', payload);
  }

  editMessage(payload: EditMessagePayload): Promise<EditMessageAck> {
    return new Promise((resolve) => this.socket.emit('session:message:edit', payload, resolve));
  }

  deleteMessage(payload: DeleteMessagePayload): Promise<DeleteMessageAck> {
    return new Promise((resolve) => this.socket.emit('session:message:delete', payload, resolve));
  }

  onPresenceUpdate(cb: (users: PublicUser[]) => void): void {
    this.socket.on('presence:update', cb);
  }

  onSessionCreated(cb: (session: ChatSession) => void): void {
    this.socket.on('session:created', cb);
  }

  onSessionMessage(cb: (message: ChatMessage) => void): void {
    this.socket.on('session:message', cb);
  }

  onTyping(cb: (event: TypingEvent) => void): void {
    this.socket.on('session:typing', cb);
  }

  onMessageEdited(cb: (message: ChatMessage) => void): void {
    this.socket.on('session:message:edited', cb);
  }

  onMessageDeleted(cb: (event: DeleteMessageEvent) => void): void {
    this.socket.on('session:message:deleted', cb);
  }
}
