import { Server, Socket } from 'socket.io';
import { PrismaClient }   from '@prisma/client';
import { userSendUsdcWithFee, userSendXlm, getBalance, getFeeWalletPublic } from '../../services/stellar';
import { verifyPin }      from '../../services/crypto';
import { sendPushToUser } from '../../services/notifications';

const prisma   = new PrismaClient();
const TZS_RATE = 2600;

// ── Send payment in chat ───────────────────────────────────────────────────────

export async function handleSendPayment(io: Server, socket: Socket, data: any) {
  const { conversationId, amountUsdc, encryptedNote, recipientId, pin } = data;
  const asset: 'USDC' | 'XLM' = data.asset === 'XLM' ? 'XLM' : 'USDC';
  const amt      = Number(amountUsdc); // amount in the chosen asset
  const senderId = socket.data.userId;

  try {
    const sender = await prisma.user.findUnique({ where: { id: senderId } });
    if (!sender) { socket.emit('payment_error', { error: 'Mtumiaji hakupatikana.' }); return; }

    if (!await verifyPin(pin, sender.pinHash)) {
      socket.emit('payment_error', { error: 'Nambari ya siri si sahihi / Incorrect PIN' });
      return;
    }

    // Balance check in the chosen asset (gross — fee comes from the amount)
    const balance = await getBalance(sender.stellarPubKey);
    const have    = asset === 'XLM' ? parseFloat(balance.xlm) : parseFloat(balance.usdc);
    // For XLM keep a tiny reserve buffer for network fee + base reserve
    const buffer  = asset === 'XLM' ? 1.5 : 0;
    if (have < amt + buffer) {
      socket.emit('payment_error', {
        error: `Salio halikutosha. Una ${asset === 'XLM' ? have.toFixed(2) + ' XLM' : '$' + have.toFixed(2)} / Insufficient balance.`,
      });
      return;
    }

    const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
    if (!recipient) { socket.emit('payment_error', { error: 'Mpokeaji hakupatikana.' }); return; }

    // Create PENDING message
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId,
        type:          'PAYMENT',
        amountUsdc:    amt,                                     // amount in chosen asset
        amountTzs:     asset === 'USDC' ? amt * TZS_RATE : null,
        paymentAsset:  asset,
        paymentStatus: 'PENDING',
        paymentNote:   encryptedNote ?? null,
        deliveredAt:   new Date(),
      },
    });

    // Optimistic update — show pending immediately
    io.to(conversationId).emit('new_message', message);

    // Execute Stellar transfer with 1% fee split — USDC or XLM
    let hash: string; let netAmount: number; let feeAmount: number; let feeWallet: string;
    if (asset === 'XLM') {
      hash      = await userSendXlm({
        encryptedSecret: sender.stellarSecret, pin, phone: sender.phone,
        publicKey: sender.stellarPubKey, toAddress: recipient.stellarPubKey,
        amountXlm: amt, memo: `Chat:${message.id.slice(0, 16)}`,
      });
      feeAmount = parseFloat((amt * 0.01).toFixed(7));
      netAmount = parseFloat((amt - feeAmount).toFixed(7));
      feeWallet = getFeeWalletPublic();
    } else {
      const r = await userSendUsdcWithFee({
        encryptedSecret: sender.stellarSecret, pin, phone: sender.phone,
        publicKey: sender.stellarPubKey, toAddress: recipient.stellarPubKey,
        grossUsdc: amt, memo: `Chat:${message.id.slice(0, 16)}`,
      });
      hash = r.hash; netAmount = r.netUsdc; feeAmount = r.feeUsdc; feeWallet = r.feeWallet;
    }
    const netUsdc = netAmount; const feeUsdc = feeAmount;

    // Update message confirmed
    const confirmed = await prisma.message.update({
      where: { id: message.id },
      data:  { stellarTxId: hash, paymentStatus: 'CONFIRMED', amountUsdc: netAmount },
    });

    // DB transaction records
    await Promise.all([
      prisma.transaction.create({
        data: {
          userId:      senderId,
          type:        'SEND',
          status:      'CONFIRMED',
          amountUsdc:  netUsdc,
          stellarTxId: hash,
          toAddress:   recipient.stellarPubKey,
          memo:        `Chat payment`,
        },
      }),
      prisma.transaction.create({
        data: {
          userId:      recipientId,
          type:        'RECEIVE',
          status:      'CONFIRMED',
          amountUsdc:  netUsdc,
          stellarTxId: hash,
          memo:        `Chat payment from ${sender.phone}`,
        },
      }),
      prisma.transaction.create({
        data: {
          userId:      senderId,
          type:        'FEE',
          status:      'CONFIRMED',
          amountUsdc:  feeUsdc,
          stellarTxId: hash,
          toAddress:   feeWallet,
          memo:        `1% fee chat payment`,
        },
      }),
    ]).catch(() => {});

    // Emit confirmed to room
    io.to(conversationId).emit('payment_confirmed', {
      messageId:     message.id,
      stellarTxId:   hash,
      paymentStatus: 'CONFIRMED',
      netUsdc,
      asset,
    });

    // ── Push notifications ──────────────────────────────────────────────────
    const senderName = sender.kycName ?? sender.phone.slice(-4);
    const amount     = asset === 'XLM' ? `${netUsdc.toFixed(2)} XLM` : `$${netUsdc.toFixed(2)} USDC`;

    // Receiver: money arrived
    sendPushToUser(recipientId, {
      title: '💚 Umepokea pesa!',
      body:  `${senderName} amekutumia ${amount} / sent you ${amount}`,
      type:  'money_in',
      data:  { conversationId, type: 'payment', amount: netUsdc, from: senderName, stellarTxId: hash },
    }).catch(() => {});

    // Sender: confirm sent
    sendPushToUser(senderId, {
      title: '✅ Pesa imetumwa',
      body:  `Umetuma ${amount} kwa ${recipient.kycName ?? recipient.phone.slice(-4)}`,
      type:  'money_out',
      data:  { conversationId, type: 'payment_sent', amount: netUsdc, stellarTxId: hash },
    }).catch(() => {});

  } catch (e: any) {
    console.error('[socket:payment]', e.message);
    const msg = String(e?.message ?? '').includes('WALLET_KEY')
      ? 'Your wallet needs re-activation. Go to Profile → Re-activate wallet, then try again.'
      : (e?.message ?? 'Transfer failed. Please try again.');
    socket.emit('payment_error', { error: msg });
  }
}

// ── Send payment request ───────────────────────────────────────────────────────

export async function handlePaymentRequest(io: Server, socket: Socket, data: any) {
  const { conversationId, amountUsdc, encryptedNote, expiresInHours = 24 } = data;
  const asset: 'USDC' | 'XLM' = data.asset === 'XLM' ? 'XLM' : 'USDC';
  const amount   = Number(amountUsdc);
  const senderId = socket.data.userId;

  try {
    const sender    = await prisma.user.findUnique({ where: { id: senderId }, select: { kycName: true, phone: true } });
    const expiresAt = new Date(Date.now() + expiresInHours * 3_600_000);

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId,
        type:          'PAYMENT_REQUEST',
        amountUsdc:    amount,
        amountTzs:     asset === 'USDC' ? amount * TZS_RATE : null,
        paymentAsset:  asset,
        paymentStatus: 'PENDING',
        paymentNote:   encryptedNote ?? null,
        deliveredAt:   new Date(),
        deletedAt:     expiresAt, // repurpose field for expiry
      },
      include: { sender: { select: { id: true, kycName: true, chatPublicKey: true } } },
    });

    io.to(conversationId).emit('new_message', message);

    // Notify all other members of the request
    const members = await prisma.conversationMember.findMany({
      where:   { conversationId, userId: { not: senderId } },
      select:  { userId: true },
    });
    const requesterName = sender?.kycName ?? sender?.phone?.slice(-4) ?? 'Someone';
    for (const m of members) {
      sendPushToUser(m.userId, {
        title: '💛 Ombi la malipo / Payment Request',
        body:  `${requesterName} anaomba $${amountUsdc.toFixed(2)} USDC`,
        type:  'payment_request',
        data:  { conversationId, messageId: message.id, amount: amountUsdc, type: 'payment_request' },
      }).catch(() => {});
    }
  } catch (e: any) {
    socket.emit('error', { message: 'Ombi la malipo halikufanikiwa.' });
  }
}

// ── Accept (pay) a payment request ────────────────────────────────────────────

export async function handlePayRequest(io: Server, socket: Socket, data: any) {
  const { messageId, pin } = data;
  const payerId = socket.data.userId;

  try {
    const requestMsg = await prisma.message.findUnique({
      where:   { id: messageId },
      include: {
        sender: true,
        conversation: { include: { participants: { include: { user: { select: { id: true, phone: true, kycName: true } } } } } },
      },
    });

    if (!requestMsg || requestMsg.type !== 'PAYMENT_REQUEST') {
      socket.emit('payment_error', { error: 'Ombi la malipo halipatikani.' });
      return;
    }
    if (requestMsg.paymentStatus !== 'PENDING') {
      socket.emit('payment_error', { error: 'Ombi hili tayari limeshughulikiwa / Request already processed.' });
      return;
    }
    // Can't pay your own request
    if (requestMsg.senderId === payerId) {
      socket.emit('payment_error', { error: 'Huwezi kulipa ombi lako mwenyewe / Cannot pay your own request.' });
      return;
    }

    const payer = await prisma.user.findUnique({ where: { id: payerId } });
    if (!payer) return;

    if (!await verifyPin(pin, payer.pinHash)) {
      socket.emit('payment_error', { error: 'Nambari ya siri si sahihi / Incorrect PIN' });
      return;
    }

    const grossUsdc = requestMsg.amountUsdc!;
    const asset: 'USDC' | 'XLM' = (requestMsg as any).paymentAsset === 'XLM' ? 'XLM' : 'USDC';

    // Balance check in the requested asset
    const balance = await getBalance(payer.stellarPubKey);
    const have    = asset === 'XLM' ? parseFloat(balance.xlm) : parseFloat(balance.usdc);
    const buffer  = asset === 'XLM' ? 1.5 : 0;
    if (have < grossUsdc + buffer) {
      socket.emit('payment_error', {
        error: `Salio halikutosha. Una ${asset === 'XLM' ? have.toFixed(2) + ' XLM' : '$' + have.toFixed(2)} / Insufficient balance.`,
      });
      return;
    }

    // Execute with 1% fee split — USDC or XLM
    let hash: string; let netUsdc: number; let feeUsdc: number; let feeWallet: string;
    if (asset === 'XLM') {
      hash      = await userSendXlm({
        encryptedSecret: payer.stellarSecret, pin, phone: payer.phone,
        publicKey: payer.stellarPubKey, toAddress: requestMsg.sender.stellarPubKey,
        amountXlm: grossUsdc, memo: `PayReq:${messageId.slice(0, 14)}`,
      });
      feeUsdc   = parseFloat((grossUsdc * 0.01).toFixed(7));
      netUsdc   = parseFloat((grossUsdc - feeUsdc).toFixed(7));
      feeWallet = getFeeWalletPublic();
    } else {
      const r = await userSendUsdcWithFee({
        encryptedSecret: payer.stellarSecret, pin, phone: payer.phone,
        publicKey: payer.stellarPubKey, toAddress: requestMsg.sender.stellarPubKey,
        grossUsdc, memo: `PayReq:${messageId.slice(0, 14)}`,
      });
      hash = r.hash; netUsdc = r.netUsdc; feeUsdc = r.feeUsdc; feeWallet = r.feeWallet;
    }

    // Update request message
    await prisma.message.update({
      where: { id: messageId },
      data:  { stellarTxId: hash, paymentStatus: 'CONFIRMED', amountUsdc: netUsdc },
    });

    // DB records
    await Promise.all([
      prisma.transaction.create({
        data: { userId: payerId, type: 'SEND', status: 'CONFIRMED', amountUsdc: netUsdc, stellarTxId: hash, toAddress: requestMsg.sender.stellarPubKey, memo: `Pay request` },
      }),
      prisma.transaction.create({
        data: { userId: requestMsg.senderId, type: 'RECEIVE', status: 'CONFIRMED', amountUsdc: netUsdc, stellarTxId: hash, memo: `Request paid by ${payer.phone}` },
      }),
      prisma.transaction.create({
        data: { userId: payerId, type: 'FEE', status: 'CONFIRMED', amountUsdc: feeUsdc, stellarTxId: hash, toAddress: feeWallet, memo: `1% fee pay request` },
      }),
    ]).catch(() => {});

    io.to(requestMsg.conversationId).emit('payment_confirmed', {
      messageId, stellarTxId: hash, paymentStatus: 'CONFIRMED', netUsdc, asset,
    });

    // ── Push notifications ────────────────────────────────────────────────
    const payerName   = payer.kycName   ?? payer.phone.slice(-4);
    const amount      = asset === 'XLM' ? `${netUsdc.toFixed(2)} XLM` : `$${netUsdc.toFixed(2)} USDC`;

    // Requester: money received
    sendPushToUser(requestMsg.senderId, {
      title: '💚 Ombi lako limelipwa! / Request paid!',
      body:  `${payerName} akulipa ${amount}`,
      type:  'money_in',
      data:  { conversationId: requestMsg.conversationId, amount: netUsdc, from: payerName, stellarTxId: hash },
    }).catch(() => {});

    // Payer: confirm
    sendPushToUser(payerId, {
      title: '✅ Malipo yamefanikiwa',
      body:  `Umelipa ${amount} kwa ${requestMsg.sender.kycName ?? requestMsg.sender.phone.slice(-4)}`,
      type:  'money_out',
      data:  { conversationId: requestMsg.conversationId, amount: netUsdc, stellarTxId: hash },
    }).catch(() => {});

  } catch (e: any) {
    console.error('[socket:pay_request]', e.message);
    const msg = String(e?.message ?? '').includes('WALLET_KEY')
      ? 'Your wallet needs re-activation. Go to Profile → Re-activate wallet, then try again.'
      : (e?.message ?? 'Transfer failed. Please try again.');
    socket.emit('payment_error', { error: msg });
  }
}

// ── Reject a payment request ───────────────────────────────────────────────────

export async function handleRejectRequest(io: Server, socket: Socket, data: any) {
  const { messageId } = data;
  const rejecterId    = socket.data.userId;

  try {
    const requestMsg = await prisma.message.findUnique({
      where:   { id: messageId },
      include: { sender: { select: { id: true, kycName: true, phone: true } } },
    });

    if (!requestMsg || requestMsg.type !== 'PAYMENT_REQUEST') return;
    if (requestMsg.paymentStatus !== 'PENDING') return;
    if (requestMsg.senderId === rejecterId) return; // can't reject own request

    await prisma.message.update({
      where: { id: messageId },
      data:  { paymentStatus: 'FAILED' },
    });

    io.to(requestMsg.conversationId).emit('request_rejected', {
      messageId,
      paymentStatus: 'FAILED',
      rejectedBy:    rejecterId,
    });

    // Notify requester
    const rejecter = await prisma.user.findUnique({ where: { id: rejecterId }, select: { kycName: true, phone: true } });
    sendPushToUser(requestMsg.senderId, {
      title: '❌ Ombi limekataliwa / Request declined',
      body:  `${rejecter?.kycName ?? 'Mtu'} alikataa ombi lako la $${(requestMsg.amountUsdc ?? 0).toFixed(2)}`,
      type:  'payment_request_rejected',
      data:  { conversationId: requestMsg.conversationId, messageId },
    }).catch(() => {});

  } catch (e: any) {
    console.error('[socket:reject_request]', e.message);
  }
}
