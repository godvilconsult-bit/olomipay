import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { getBalance, platformSendUsdc } from '../../services/stellar';
import { verifyPin } from '../../services/crypto';
import { sendPushToUser } from '../../services/notifications';

const prisma = new PrismaClient();

const TZS_RATE = 2600; // fallback rate

export async function handleSendPayment(io: Server, socket: Socket, data: any) {
  const { conversationId, amountUsdc, encryptedNote, recipientId, pin } = data;
  const senderId = socket.data.userId;

  try {
    const sender = await prisma.user.findUnique({ where: { id: senderId } });
    if (!sender) { socket.emit('payment_error', { error: 'Mtumiaji hakupatikana.' }); return; }

    // Verify PIN
    if (!await verifyPin(pin, sender.pinHash)) {
      socket.emit('payment_error', { error: 'Nambari ya siri si sahihi.' });
      return;
    }

    // Check balance
    const balance = await getBalance(sender.stellarPubKey);
    const fee = amountUsdc * 0.01;
    if (parseFloat(balance.usdc) < amountUsdc + fee) {
      socket.emit('payment_error', { error: `Salio halikutosha. Una $${balance.usdc} USDC.` });
      return;
    }

    const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
    if (!recipient) { socket.emit('payment_error', { error: 'Mpokeaji hakupatikana.' }); return; }

    // Create PENDING message immediately
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId,
        type:          'PAYMENT',
        amountUsdc,
        amountTzs:     amountUsdc * TZS_RATE,
        paymentStatus: 'PENDING',
        paymentNote:   encryptedNote ?? null,
        deliveredAt:   new Date(),
      },
    });

    // Emit pending immediately (optimistic UI)
    io.to(conversationId).emit('new_message', message);

    // Submit Stellar transfer
    const hash = await platformSendUsdc(
      recipient.stellarPubKey,
      amountUsdc,
      `Chat:${message.id.slice(0, 20)}`,
    );

    // Update message confirmed
    const confirmed = await prisma.message.update({
      where: { id: message.id },
      data:  { stellarTxId: hash, paymentStatus: 'CONFIRMED' },
    });

    // Log as transaction
    await prisma.transaction.create({
      data: {
        userId:     senderId,
        type:       'SEND',
        status:     'CONFIRMED',
        amountUsdc,
        stellarTxId: hash,
        toAddress:  recipient.stellarPubKey,
        memo:       `Chat payment`,
      },
    }).catch(() => {});

    // Emit confirmed to room
    io.to(conversationId).emit('payment_confirmed', {
      messageId: message.id,
      stellarTxId: hash,
      paymentStatus: 'CONFIRMED',
    });

    // Push to recipient
    await sendPushToUser(recipientId, {
      title: 'Pesa imefika! 💚',
      body:  `Umepokea $${amountUsdc.toFixed(2)} USDC`,
      type:  'payment_received',
      data:  { conversationId, type: 'payment' },
    }).catch(() => {});

  } catch (e: any) {
    console.error('[socket:payment]', e.message);
    // Mark failed in DB
    socket.emit('payment_error', { error: 'Malipo hayakufanikiwa. Jaribu tena.' });
  }
}

export async function handlePaymentRequest(io: Server, socket: Socket, data: any) {
  const { conversationId, amountUsdc, encryptedNote, expiresInHours = 24 } = data;
  const senderId = socket.data.userId;

  try {
    const expiresAt = new Date(Date.now() + expiresInHours * 3_600_000);

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId,
        type:          'PAYMENT_REQUEST',
        amountUsdc,
        amountTzs:     amountUsdc * TZS_RATE,
        paymentStatus: 'PENDING',
        paymentNote:   encryptedNote ?? null,
        deliveredAt:   new Date(),
        // Store expiry in deletedAt field temporarily
        deletedAt:     expiresAt,
      },
      include: { sender: { select: { id: true, kycName: true, chatPublicKey: true } } },
    });

    io.to(conversationId).emit('new_message', message);
  } catch (e: any) {
    socket.emit('error', { message: 'Ombi la malipo halikufanikiwa.' });
  }
}

export async function handlePayRequest(io: Server, socket: Socket, data: any) {
  const { messageId, pin } = data;
  const payerId = socket.data.userId;

  try {
    const requestMsg = await prisma.message.findUnique({
      where:   { id: messageId },
      include: { sender: true, conversation: { include: { participants: { include: { user: true } } } } },
    });

    if (!requestMsg || requestMsg.type !== 'PAYMENT_REQUEST') {
      socket.emit('payment_error', { error: 'Ombi la malipo halipatikani.' });
      return;
    }
    if (requestMsg.paymentStatus !== 'PENDING') {
      socket.emit('payment_error', { error: 'Ombi hili tayari limeshughulikiwa.' });
      return;
    }

    const payer = await prisma.user.findUnique({ where: { id: payerId } });
    if (!payer) return;

    if (!await verifyPin(pin, payer.pinHash)) {
      socket.emit('payment_error', { error: 'Nambari ya siri si sahihi.' });
      return;
    }

    const amountUsdc = requestMsg.amountUsdc!;
    const hash = await platformSendUsdc(
      requestMsg.sender.stellarPubKey,
      amountUsdc,
      `PayReq:${messageId.slice(0, 16)}`,
    );

    await prisma.message.update({
      where: { id: messageId },
      data:  { stellarTxId: hash, paymentStatus: 'CONFIRMED' },
    });

    io.to(requestMsg.conversationId).emit('payment_confirmed', {
      messageId, stellarTxId: hash, paymentStatus: 'CONFIRMED',
    });

    await sendPushToUser(requestMsg.senderId, {
      title: 'Ombi lako limelipwa! ✅',
      body:  `Umepokea $${amountUsdc.toFixed(2)} USDC`,
      type:  'payment_received',
      data:  { conversationId: requestMsg.conversationId },
    }).catch(() => {});

  } catch (e: any) {
    socket.emit('payment_error', { error: 'Malipo hayakufanikiwa. Jaribu tena.' });
  }
}
