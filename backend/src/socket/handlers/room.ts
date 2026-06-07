import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { unreadMessageTotal } from '../../services/notifications';


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

    // Update the reader's app-icon badge across all their devices.
    const count = await unreadMessageTotal(userId);
    io.to(`user:${userId}`).emit('badge_update', { count });

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
      socket.emit('error', { message: 'You can only delete your own messages for everyone.' });
      return;
    }
    // Delete-for-everyone allowed on your own messages at any time.
    await prisma.message.update({
      where: { id: messageId },
      data:  { isDeleted: true, deletedAt: new Date(), encryptedContent: null, plainContent: null },
    });
    io.to(message.conversationId).emit('message_deleted', { messageId });
  } catch (e: any) {
    console.error('[socket:delete]', e.message);
  }
}
