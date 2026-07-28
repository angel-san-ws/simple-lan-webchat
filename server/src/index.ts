import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { ChatStore } from './store.js';
import type {
  CreateSessionAck,
  CreateSessionPayload,
  DeleteMessageAck,
  DeleteMessagePayload,
  EditMessageAck,
  EditMessagePayload,
  JoinAck,
  JoinPayload,
  SendMessagePayload,
  TypingPayload,
} from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist', 'client', 'browser');

const app = express();
app.use(cors());
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use(express.static(CLIENT_DIST));
app.get(/.*/, (_req, res, next) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'), (err) => {
    if (err) next();
  });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

const store = new ChatStore();

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

io.on('connection', (socket) => {
  socket.on('user:join', (payload: JoinPayload, ack?: (res: JoinAck) => void) => {
    const name = payload?.name?.trim();
    const clientId = payload?.clientId?.trim();
    if (!isNonEmptyString(name) || name.length > 40 || !isNonEmptyString(clientId)) {
      ack?.({ ok: false, error: 'A valid display name is required.' });
      return;
    }

    const record = store.join(clientId, name, socket.id);
    socket.data.userId = record.id;

    for (const session of store.sessionsForUser(record.id)) {
      socket.join(session.id);
    }

    const user = store.toPublicUser(record.id)!;
    ack?.({
      ok: true,
      user,
      onlineUsers: store.getOnlineUsers(),
      sessions: store.sessionsForUser(record.id),
    });

    socket.broadcast.emit('presence:update', store.getOnlineUsers());
  });

  socket.on(
    'session:create',
    (payload: CreateSessionPayload, ack?: (res: CreateSessionAck) => void) => {
      const userId = socket.data.userId as string | undefined;
      if (!userId) {
        ack?.({ ok: false, error: 'Not joined.' });
        return;
      }
      const participantIds = Array.isArray(payload?.participantIds)
        ? payload.participantIds.filter(isNonEmptyString)
        : [];
      if (participantIds.length === 0) {
        ack?.({ ok: false, error: 'Select at least one participant.' });
        return;
      }

      const { session, created } = store.createOrGetSession(userId, participantIds, payload?.name);

      const socketIds = store.getSocketIdsForUsers(session.participantIds);
      for (const sid of socketIds) {
        io.sockets.sockets.get(sid)?.join(session.id);
      }

      if (created) {
        io.to(session.id).emit('session:created', session);
      }
      ack?.({ ok: true, session });
    },
  );

  socket.on('session:message', (payload: SendMessagePayload) => {
    const userId = socket.data.userId as string | undefined;
    if (!userId) return;
    const sessionId = payload?.sessionId;
    const text = payload?.text?.trim();
    if (!isNonEmptyString(sessionId) || !isNonEmptyString(text) || text.length > 4000) return;
    if (!store.isParticipant(sessionId, userId)) return;

    const message = store.addMessage(sessionId, userId, text);
    if (message) {
      io.to(sessionId).emit('session:message', message);
    }
  });

  socket.on(
    'session:message:edit',
    (payload: EditMessagePayload, ack?: (res: EditMessageAck) => void) => {
      const userId = socket.data.userId as string | undefined;
      if (!userId) {
        ack?.({ ok: false, error: 'Not joined.' });
        return;
      }
      const sessionId = payload?.sessionId;
      const messageId = payload?.messageId;
      const text = payload?.text?.trim();
      if (
        !isNonEmptyString(sessionId) ||
        !isNonEmptyString(messageId) ||
        !isNonEmptyString(text) ||
        text.length > 4000
      ) {
        ack?.({ ok: false, error: 'Invalid edit request.' });
        return;
      }
      if (!store.isParticipant(sessionId, userId)) {
        ack?.({ ok: false, error: 'Not a participant of this chat.' });
        return;
      }

      const message = store.editMessage(sessionId, messageId, userId, text);
      if (!message) {
        ack?.({ ok: false, error: 'Unable to edit this message.' });
        return;
      }
      io.to(sessionId).emit('session:message:edited', message);
      ack?.({ ok: true, message });
    },
  );

  socket.on(
    'session:message:delete',
    (payload: DeleteMessagePayload, ack?: (res: DeleteMessageAck) => void) => {
      const userId = socket.data.userId as string | undefined;
      if (!userId) {
        ack?.({ ok: false, error: 'Not joined.' });
        return;
      }
      const sessionId = payload?.sessionId;
      const messageId = payload?.messageId;
      if (!isNonEmptyString(sessionId) || !isNonEmptyString(messageId)) {
        ack?.({ ok: false, error: 'Invalid delete request.' });
        return;
      }
      if (!store.isParticipant(sessionId, userId)) {
        ack?.({ ok: false, error: 'Not a participant of this chat.' });
        return;
      }

      const message = store.deleteMessage(sessionId, messageId, userId);
      if (!message) {
        ack?.({ ok: false, error: 'Unable to delete this message.' });
        return;
      }
      io.to(sessionId).emit('session:message:deleted', { sessionId, messageId });
      ack?.({ ok: true });
    },
  );

  socket.on('session:typing', (payload: TypingPayload) => {
    const userId = socket.data.userId as string | undefined;
    if (!userId) return;
    const sessionId = payload?.sessionId;
    if (!isNonEmptyString(sessionId) || !store.isParticipant(sessionId, userId)) return;
    socket.to(sessionId).emit('session:typing', {
      sessionId,
      userId,
      isTyping: !!payload.isTyping,
    });
  });

  socket.on('disconnect', () => {
    const userId = store.disconnect(socket.id);
    if (userId) {
      socket.broadcast.emit('presence:update', store.getOnlineUsers());
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`LAN WebChat server listening on http://0.0.0.0:${PORT}`);
});
