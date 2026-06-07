import { Server, Socket } from 'socket.io';
import { PrismaClient }   from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { sendPushToUser, unreadMessageTotal } from '../../services/notifications';


async function verifyMembership(userId: string, conversationId: string): Promise<boolean> {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  }).catch(() => null);
  return !!member;
}

export async function handleSendMessage(io: Server, socket: Socket, data: any) {
  const { conversationId, encryptedContent, type, replyToId, mediaUrl, mediaThumbUrl, mediaMimeType } = data;
  const senderId = socket.data.userId;

  try {
    if (!await verifyMembership(senderId, conversationId)) {
      socket.emit('error', { message: 'You are not a member of this conversation.' });
      return;
    }

    if (encryptedContent && encryptedContent.length > 8_000) {
      socket.emit('error', { message: 'Message is too long (max 8000 chars).' });
      return;
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId,
        type:             type ?? 'TEXT',
        encryptedContent: encryptedContent ?? null,
        replyToId:        replyToId ?? null,
        mediaUrl:         mediaUrl ?? null,
        mediaThumbUrl:    mediaThumbUrl ?? null,
        mediaMimeType:    mediaMimeType ?? null,
        deliveredAt:      new Date(),
      },
      include: {
        sender:  { select: { id: true, phone: true, kycName: true, chatPublicKey: true } },
        replyTo: { select: { id: true, encryptedContent: true, senderId: true } },
      },
    });

    // Update conversation preview
    await prisma.conversation.update({
      where: { id: conversationId },
      data:  {
        lastMessageAt:      new Date(),
        lastMessagePreview: encryptedContent ?? '[Media]',
      },
    });

    // ── Delivery strategy: ONE delivery per recipient, never to the sender ──────
    // We deliver to each recipient's PERSONAL room only (below). We deliberately
    // do NOT also broadcast to the conversation room — a recipient is in BOTH
    // their personal room and the conversation room, so broadcasting to both
    // delivered every message TWICE (two notification pop-ups). The sender gets
    // a private 'message_sent' confirmation instead of an echo.

    // Confirm back to the sender ONLY (not as a new incoming message)
    socket.emit('message_sent', message);

    // Get all members except sender
    const members = await prisma.conversationMember.findMany({
      where:   { conversationId, userId: { not: senderId } },
      include: { user: { select: { id: true, isOnline: true, kycName: true, phone: true } } },
    });

    // Push title/body — sender name + a privacy-safe preview (no message content
    // on the lock screen).
    const senderName = message.sender?.kycName ?? socket.data.user?.kycName ?? 'OlomiPay';
    const mt = String(message.type);
    const preview =
      mt === 'IMAGE'           ? '📷 Photo'
      : mt === 'FILE'          ? '📎 File'
      : mt === 'PAYMENT'       ? '💸 Sent you money'
      : mt === 'PAYMENT_REQUEST' ? '💛 Requested money'
      : '💬 New message';

    for (const m of members) {
      // Also emit directly to the recipient's personal room (user:<id>)
      // so they receive it even if not in the conversation room yet
      io.to(`user:${m.user.id}`).emit('new_message', message);

      // Auto-join the recipient to this conversation room if they're online
      const recipientSockets = await io.in(`user:${m.user.id}`).fetchSockets();
      for (const s of recipientSockets) {
        s.join(conversationId);
      }

      // ALWAYS send a push — so the recipient hears/sees it even when the app is
      // backgrounded or the screen is locked (phone in pocket). "isOnline" only
      // means the socket is connected, NOT that the app is in the foreground, so
      // gating on it silently dropped pocket alerts. The service worker suppresses
      // the banner when the app is actually focused (no double-notify while
      // chatting); native FCM only surfaces in the tray when backgrounded.
      sendPushToUser(m.user.id, {
        title: senderName,
        body:  preview,
        type:  'chat',
        data:  { conversationId, type: 'chat' },
      }).catch(() => {});

      // Live badge sync — update the app-icon count on any of the recipient's
      // open sessions immediately (the push carries the count for closed apps).
      unreadMessageTotal(m.user.id)
        .then(count => io.to(`user:${m.user.id}`).emit('badge_update', { count }))
        .catch(() => {});
    }
  } catch (e: any) {
    console.error('[socket:message]', e.message);
    socket.emit('error', { message: 'Network error. Please try again.' });
  }
}

