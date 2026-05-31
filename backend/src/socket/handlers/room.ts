import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function handleMarkRead(io: Server, socket: Socket, data: any) {
  const { conversationId } = data;
  const userId = socket.data.userId;

  try {
    // Get unread messages
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) return;

    const unread = await prisma.message.findMany({
      where: {
        conversationId,
        senderId:    { not: userId },
        deliveredAt: { gt: member.lastReadAt ?? new Date(0) },
        isDeleted:   false,
      },
      select: { id: true },
    });

    if (unread.length === 0) return;

    // Upsert receipts
    await prisma.messageReceipt.createMany({
      data:           unread.map(m => ({ messageId: m.id, userId })),
      skipDuplicates: true,
    });

    // Update lastReadAt
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data:  { lastReadAt: new Date() },
    });

    // Notify senders their messages were read
    const messageIds = unread.map(m => m.id);
    socket.to(conversationId).emit('messages_read', { messageIds, readBy: userId });

  } catch (e: any) {
    console.error('[socket:markRead]', e.message);
  }
}

export async function handleDeleteMessage(io: Server, socket: Socket, data: any) {
  const { messageId } = data;
  const userId = socket.data.userId;

  try {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.senderId !== userId) {
      socket.emit('error', { message: 'Huwezi kufuta ujumbe huu.' });
      return;
    }

    // Can only delete within 60 seconds
    const ageMs = Date.now() - message.createdAt.getTime();
    if (ageMs > 60_000) {
      socket.emit('error', { message: 'Muda wa kufuta ujumbe umepita (sekunde 60).' });
      return;
    }

    await prisma.message.update({
      where: { id: messageId },
      data:  { isDeleted: true, deletedAt: new Date(), encryptedContent: null },
    });

    io.to(message.conversationId).emit('message_deleted', { messageId });

  } catch (e: any) {
    console.error('[socket:delete]', e.message);
  }
}
