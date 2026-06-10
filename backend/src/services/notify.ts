/** Persist a notification and push it live to the user over Socket.io. */
import { prisma } from '../lib/prisma';
import { emitToUser } from '../socket';

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
  } catch {
    // Notifications are best-effort; never block the request that triggered them.
  }
}
