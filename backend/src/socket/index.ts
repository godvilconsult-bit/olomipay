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
import { haversineKm } from '../lib/geo';
import { notify } from '../services/notify';

let _io: Server | null = null;

// Deliveries we've already sent an "arrived" alert for (reset on restart).
const arrivedNotified = new Set<string>();

// Live-location scale guards: relay every ping in-memory, but cache the
// delivery→order metadata and throttle DB writes so thousands of riders pinging
// every few seconds don't hammer Postgres.
const deliveryMeta = new Map<string, { householdId: string; supplierUserId?: string; dropLat: number | null; dropLng: number | null; orderId: string; orderNo: string; status: string }>();
const lastRiderWrite = new Map<string, number>();
const lastDeliveryWrite = new Map<string, number>();
const LOC_WRITE_MS = 12_000;

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
      const now = Date.now();

      // Ambient position (powers "nearby riders") — throttled write, not every ping.
      if (now - (lastRiderWrite.get(userId) ?? 0) > LOC_WRITE_MS) {
        lastRiderWrite.set(userId, now);
        prisma.riderProfile.update({ where: { userId }, data: { currentLat: lat, currentLng: lng } }).catch(() => {});
      }

      if (!deliveryId) return;

      // Cache delivery → order metadata so we never read the DB per ping.
      let meta = deliveryMeta.get(deliveryId);
      if (!meta) {
        const d = await prisma.delivery.findUnique({
          where:  { id: deliveryId },
          select: { dropLat: true, dropLng: true, order: { select: { id: true, orderNo: true, status: true, householdId: true, supplier: { select: { userId: true } } } } },
        }).catch(() => null);
        if (!d?.order) return;
        meta = { householdId: d.order.householdId, supplierUserId: d.order.supplier?.userId ?? undefined, dropLat: d.dropLat, dropLng: d.dropLng, orderId: d.order.id, orderNo: d.order.orderNo, status: d.order.status };
        deliveryMeta.set(deliveryId, meta);
      }

      // Always relay live (in-memory, cheap) so the map stays real-time.
      emitToUser(meta.householdId, 'delivery:location', { deliveryId, lat, lng });
      if (meta.supplierUserId) emitToUser(meta.supplierUserId, 'delivery:location', { deliveryId, lat, lng });

      // Geofence arrival — one alert per delivery.
      if (meta.status === 'PICKED' && meta.dropLat != null && meta.dropLng != null && !arrivedNotified.has(deliveryId) && haversineKm(lat, lng, meta.dropLat, meta.dropLng) <= 0.15) {
        arrivedNotified.add(deliveryId);
        emitToUser(meta.householdId, 'order:arriving', { orderId: meta.orderId });
        await notify(meta.householdId, { title: 'Your rider has arrived 🏍️', body: `${meta.orderNo}: the rider is at your location. Have your code ready.`, type: 'order', data: { orderId: meta.orderId } });
      }

      // Persist last-known position + refresh status (so the geofence fires after
      // pickup) — throttled to once per LOC_WRITE_MS per delivery.
      if (now - (lastDeliveryWrite.get(deliveryId) ?? 0) > LOC_WRITE_MS) {
        lastDeliveryWrite.set(deliveryId, now);
        const upd = await prisma.delivery.update({
          where:  { id: deliveryId },
          data:   { riderLat: lat, riderLng: lng, lastLocationAt: new Date() },
          select: { order: { select: { status: true } } },
        }).catch(() => null);
        if (upd?.order) meta!.status = upd.order.status;
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
