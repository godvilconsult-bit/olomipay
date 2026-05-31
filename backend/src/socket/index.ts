/**
 * Socket.io server for Tuma chat.
 * Redis adapter for horizontal scaling.
 * JWT auth middleware on every connection.
 */

import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { handleSendMessage }     from './handlers/message';
import { handleSendPayment, handlePaymentRequest, handlePayRequest } from './handlers/payment';
import { handleMarkRead, handleDeleteMessage } from './handlers/room';

const prisma = new PrismaClient();

// Rate limiting per socket
const messageRates  = new Map<string, { count: number; resetAt: number }>();
const paymentRates  = new Map<string, { count: number; resetAt: number }>();

function rateCheck(map: Map<string, any>, userId: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = map.get(userId);
  if (!entry || now > entry.resetAt) {
    map.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

export function initSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: [
        process.env.CORS_ORIGIN ?? 'http://localhost:3000',
        'https://olomipay.vercel.app',
      ],
      credentials: true,
    },
    transports:    ['websocket', 'polling'],
    pingTimeout:   60_000,
    pingInterval:  25_000,
  });

  // Optional Redis adapter (gracefully skip if no REDIS_URL)
  if (process.env.REDIS_URL) {
    Promise.all([
      import('ioredis').then(m => new m.default(process.env.REDIS_URL!)),
    ]).then(([pubClient]) => {
      const subClient = pubClient.duplicate();
      import('@socket.io/redis-adapter').then(({ createAdapter }) => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('[socket] Redis adapter connected');
      });
    }).catch(e => console.warn('[socket] Redis unavailable, using in-memory adapter:', e.message));
  }

  // ── JWT Auth Middleware ─────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string;
      if (!token) return next(new Error('No token'));
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      const user = await prisma.user.findUnique({
        where:  { id: payload.userId },
        select: { id: true, phone: true, kycName: true, chatPublicKey: true, isOnline: true },
      });
      if (!user) return next(new Error('User not found'));
      socket.data.userId = user.id;
      socket.data.user   = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection handler ───────────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string;
    console.log(`[socket] ${userId} connected`);

    // Mark online
    await prisma.user.update({
      where: { id: userId },
      data:  { isOnline: true, lastSeenAt: new Date() },
    }).catch(() => {});

    // Join all conversation rooms
    try {
      const memberships = await prisma.conversationMember.findMany({
        where:  { userId },
        select: { conversationId: true },
      });
      memberships.forEach(m => socket.join(m.conversationId));
    } catch {}

    socket.broadcast.emit('user_online', { userId });

    // ── Message events ────────────────────────────────────────────────────────
    socket.on('send_message', async (data) => {
      if (!rateCheck(messageRates, userId, 10, 1_000)) {
        socket.emit('error', { message: 'Polepole! Unajaribu kutuma ujumbe haraka sana.' });
        return;
      }
      await handleSendMessage(io, socket, data);
    });

    socket.on('send_payment', async (data) => {
      if (!rateCheck(paymentRates, userId, 5, 60_000)) {
        socket.emit('error', { message: 'Malipo mengi sana. Subiri dakika moja.' });
        return;
      }
      await handleSendPayment(io, socket, data);
    });

    socket.on('payment_request',  (data) => handlePaymentRequest(io, socket, data));
    socket.on('pay_request',      (data) => handlePayRequest(io, socket, data));
    socket.on('mark_read',        (data) => handleMarkRead(io, socket, data));
    socket.on('delete_message',   (data) => handleDeleteMessage(io, socket, data));

    // ── Typing indicators ──────────────────────────────────────────────────────
    socket.on('typing_start', ({ conversationId }: { conversationId: string }) => {
      socket.to(conversationId).emit('typing', { userId, conversationId });
    });

    socket.on('typing_stop', ({ conversationId }: { conversationId: string }) => {
      socket.to(conversationId).emit('stopped_typing', { userId, conversationId });
    });

    // ── Join a specific conversation ───────────────────────────────────────────
    socket.on('join_conversation', async ({ conversationId }: { conversationId: string }) => {
      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      }).catch(() => null);
      if (member) socket.join(conversationId);
    });

    // ── Disconnect ─────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`[socket] ${userId} disconnected`);
      await prisma.user.update({
        where: { id: userId },
        data:  { isOnline: false, lastSeenAt: new Date() },
      }).catch(() => {});
      io.emit('user_offline', { userId, lastSeen: new Date() });
    });
  });

  return io;
}
