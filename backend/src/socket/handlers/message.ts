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

    // ── Delivery strategy: recipients only (NEVER echo to the sender) ───────────
    // CRITICAL: do NOT broadcast the message back to the sender. The sender
    // already shows it optimistically; echoing it back caused it to re-appear as
    // an incoming "reply" in some timing cases. We:
    //   • broadcast to the room EXCLUDING the sender's socket (socket.to),
    //   • emit to each recipient's personal room (excludes sender by query),
    //   • send the sender a private 'message_sent' confirmation so they can
    //     swap their optimistic bubble for the saved message (real id + ticks).

    // Reaches other members already in the conversation room (sender excluded)
    socket.to(conversationId).emit('new_message', message);

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

