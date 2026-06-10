/**
 * Socket.io — the real-time spine of JIKO CONNECT.
 *
 *   • Suppliers get instant `order:new` alerts when a household orders.
 *   • Riders in a region get `job:new` broadcasts and `job:taken` when claimed.
 *   • Households watch their rider move via `delivery:location`.
 *
 * REST routes drive most emits through the helpers below; the socket connection
 * itself carries rider location pings and online/offline status.
 */
import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

let _io: Server | null = null;

export function getIo(): Server | null { return _io; }

/** Push an event to a single user's personal room. */
export function emitToUser(userId: string, event: string, data: any): void {
  _io?.to(`user:${userId}`).emit(event, data);
}

/** Broadcast to every rider currently subscribed to a region. */
export function emitToRiders(region: string, event: string, data: any): void {
  _io?.to(`riders:${region}`).emit(event, data);
}

function regionRoom(region?: string | null): string {
  return `riders:${(region ?? 'ALL').trim()}`;
}

export function initSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => cb(null, true),
      credentials: true,
    },
    transports:   ['websocket', 'polling'],
    pingTimeout:  60_000,
    pingInterval: 25_000,
  });
  _io = io;

  // ── Auth on connect ──────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string;
      if (!token) return next(new Error('No token'));
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; role: string };
      const user = await prisma.user.findUnique({
        where:  { id: payload.userId },
        select: { id: true, role: true, region: true, riderProfile: { select: { region: true } } },
      });
      if (!user) return next(new Error('User not found'));
      socket.data.userId = user.id;
      socket.data.role   = user.role;
      socket.data.region = user.riderProfile?.region ?? user.region ?? 'ALL';
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string;
    const role   = socket.data.role   as string;
    const region = socket.data.region as string;

    socket.join(`user:${userId}`);
    if (role === 'RIDER') socket.join(regionRoom(region));

    await prisma.user.update({
      where: { id: userId },
      data:  { isOnline: true, lastSeenAt: new Date() },
    }).catch(() => {});

    // ── Rider goes online / offline ──────────────────────────────────────────────
    socket.on('rider:status', async ({ status }: { status: 'ONLINE' | 'OFFLINE' | 'ON_JOB' }) => {
      if (role !== 'RIDER') return;
      await prisma.riderProfile.update({
        where: { userId },
        data:  { status: status as any },
      }).catch(() => {});
      if (status === 'OFFLINE') socket.leave(regionRoom(region));
      else socket.join(regionRoom(region));
    });

    // ── Rider location ping (every few seconds while moving) ──────────────────────
    socket.on('rider:location', async ({ lat, lng, deliveryId }: { lat: number; lng: number; deliveryId?: string }) => {
      if (role !== 'RIDER' || typeof lat !== 'number' || typeof lng !== 'number') return;
      await prisma.riderProfile.update({
        where: { userId },
        data:  { currentLat: lat, currentLng: lng },
      }).catch(() => {});

      if (deliveryId) {
        const d = await prisma.delivery.update({
          where: { id: deliveryId },
          data:  { riderLat: lat, riderLng: lng, lastLocationAt: new Date() },
          select: { order: { select: { householdId: true } } },
        }).catch(() => null);
        if (d?.order) emitToUser(d.order.householdId, 'delivery:location', { deliveryId, lat, lng });
      }
    });

    socket.on('disconnect', async () => {
      await prisma.user.update({
        where: { id: userId },
        data:  { isOnline: false, lastSeenAt: new Date() },
      }).catch(() => {});
    });
  });

  return io;
}
