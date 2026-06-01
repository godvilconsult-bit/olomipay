import { Server, Socket } from 'socket.io';
import { PrismaClient }   from '@prisma/client';
import { sendPushToUser } from '../../services/notifications';

const prisma = new PrismaClient();

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

    // ── Delivery strategy: room + personal rooms ────────────────────────────
    // io.to(conversationId) only reaches sockets that have already joined the room.
    // If the recipient just logged in or hasn't opened this conversation yet,
    // they won't be in the room — so we ALSO emit to their personal user:<id> room.
    // This guarantees delivery regardless of conversation room membership.

    // Emit to conversation room (reaches anyone already in it)
    io.to(conversationId).emit('new_message', message);

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
          body:  '🔒 Ujumbe mpya / New message',
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

