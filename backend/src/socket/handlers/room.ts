import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function handleMarkRead(io: Server, socket: Socket, data: any) {
  const { conversationId } = data;
  const userId = socket.data.userId;

  try {
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) return;

    // Find all unread messages from OTHER users
    const unread = await prisma.message.findMany({
      where: {
        conversationId,
        senderId:  { not: userId },
        isDeleted: false,
        receipts:  { none: { userId } }, // not yet read by me
      },
      select: { id: true, senderId: true },
    });

    if (unread.length === 0) return;

    // Create read receipts
    await prisma.messageReceipt.createMany({
      data:           unread.map(m => ({ messageId: m.id, userId })),
      skipDuplicates: true,
    });

    // Update lastReadAt
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data:  { lastReadAt: new Date() },
    });

    // Tell senders their messages were read (blue ticks)
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
    if (Date.now() - message.createdAt.getTime() > 60_000) {
      socket.emit('error', { message: 'Muda wa kufuta umepita.' });
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
