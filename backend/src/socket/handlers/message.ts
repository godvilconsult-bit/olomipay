import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
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
      socket.emit('error', { message: 'Huna ruhusa katika mazungumzo haya.' });
      return;
    }

    // Validate size
    if (encryptedContent && encryptedContent.length > 8_000) {
      socket.emit('error', { message: 'Ujumbe ni mrefu sana.' });
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
        sender: { select: { id: true, phone: true, kycName: true, chatPublicKey: true } },
        replyTo: { select: { id: true, encryptedContent: true, senderId: true } },
      },
    });

    // Update conversation preview
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt:      new Date(),
        lastMessagePreview: encryptedContent ?? '[Media]',
      },
    });

    // Emit to all in room
    io.to(conversationId).emit('new_message', message);

    // Push to offline members
    const members = await prisma.conversationMember.findMany({
      where:   { conversationId, userId: { not: senderId } },
      include: { user: { select: { id: true, isOnline: true } } },
    });

    for (const m of members) {
      if (!m.user.isOnline) {
        await sendPushToUser(m.user.id, {
          title: socket.data.user?.kycName ?? 'Tuma',
          body:  '🔒 Ujumbe mpya wa siri',
          type:  'chat',
          data:  { conversationId, type: 'chat' },
        }).catch(() => {});
      }
    }
  } catch (e: any) {
    console.error('[socket:message]', e.message);
    socket.emit('error', { message: 'Tatizo la mtandao. Jaribu tena.' });
  }
}
