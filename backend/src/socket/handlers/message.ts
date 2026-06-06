import { Server, Socket } from 'socket.io';
import { PrismaClient }   from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { sendPushToUser } from '../../services/notifications';


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

    for (const m of members) {
      // Also emit directly to the recipient's personal room (user:<id>)
      // so they receive it even if not in the conversation room yet
      io.to(`user:${m.user.id}`).emit('new_message', message);

      // Auto-join the recipient to this conversation room if they're online
      const recipientSockets = await io.in(`user:${m.user.id}`).fetchSockets();
      for (const s of recipientSockets) {
        s.join(conversationId);
      }

      // Push notification for offline users
      if (!m.user.isOnline) {
        sendPushToUser(m.user.id, {
          title: socket.data.user?.kycName ?? 'OlomiPay',
          body:  '🔒 New message',
          type:  'chat',
          data:  { conversationId, type: 'chat' },
        }).catch(() => {});
      }
    }
  } catch (e: any) {
    console.error('[socket:message]', e.message);
    socket.emit('error', { message: 'Network error. Please try again.' });
  }
}

