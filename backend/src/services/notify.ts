/** Persist a notification, push it live over Socket.io, and fire a web push. */
import { prisma } from '../lib/prisma';
import { emitToUser } from '../socket';
import { sendWebPush } from './push';

export async function notify(userId: string, n: {
  title: string;
  body: string;
  type: string;
  data?: any;
}): Promise<void> {
  try {
    const row = await prisma.notification.create({
      data: { userId, title: n.title, body: n.body, type: n.type, data: n.data ?? undefined },
    });
    emitToUser(userId, 'notification', row);
    // Background push (works when the app/socket is closed). Best-effort.
    sendWebPush(userId, { title: n.title, body: n.body, tag: n.type }).catch(() => {});
  } catch {
    // Notifications are best-effort; never block the request that triggered them.
  }
}
