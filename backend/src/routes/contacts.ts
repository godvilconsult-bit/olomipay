import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { contractTransfer, platformSendUsdc } from '../services/stellar';
import { verifyPin } from '../services/crypto';
import { sendSms, claimSmsMessage } from '../services/sms';
import { notify } from '../services/notifications';

const router = Router();
const prisma = new PrismaClient();

const limiter = rateLimit({ windowMs: 60_000, max: 5,
  message: { success: false, error: 'Too many requests' } });

const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// ── POST /api/contacts/sync ───────────────────────────────────────────────────
// Check which phone numbers are registered on OlomiPay.

router.post('/sync', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    phoneNumbers: z.array(z.string()).max(500),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const users = await prisma.user.findMany({
    where:  { phone: { in: parse.data.phoneNumbers } },
    select: { phone: true, stellarPubKey: true },
  });

  const registered = new Map(users.map((u: { phone: string; stellarPubKey: string }) => [u.phone, u.stellarPubKey]));

  const result = parse.data.phoneNumbers.map(phone => ({
    phone,
    onOlomiPay:    registered.has(phone),
    stellarPubKey: registered.get(phone) ?? null,
  }));

  return res.json(ok({ contacts: result }));
});

// ── POST /api/send/contact ────────────────────────────────────────────────────
// Send to phone number — if not registered, create a claimable escrow.

router.post('/send', requireAuth, limiter, async (req: AuthRequest, res) => {
  const parse = z.object({
    toPhone:    z.string().regex(/^\+255\d{9}$/),
    amount:     z.number().positive().max(10_000),
    asset:      z.enum(['USDC', 'XLM']).default('USDC'),
    memo:       z.string().max(50).optional(),
    pin:        z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const { toPhone, amount, asset, memo, pin } = parse.data;

  const sender = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!sender) return res.status(404).json(fail('Sender not found'));

  const valid = await verifyPin(pin, sender.pinHash);
  if (!valid) return res.status(403).json(fail('Incorrect PIN / PIN si sahihi'));

  // Check if recipient is registered
  const recipient = await prisma.user.findUnique({ where: { phone: toPhone } });

  if (recipient) {
    // Direct Stellar transfer
    try {
      const hash = await contractTransfer({
        fromEncryptedSecret: sender.stellarSecret,
        fromPin:             pin,
        fromPhone:           sender.phone,
        fromPublicKey:       sender.stellarPubKey,
        toPublicKey:         recipient.stellarPubKey,
        amountUsdc:          amount,
        memo:                memo ?? `From ${sender.phone}`,
      });

      await prisma.transaction.create({ data: {
        userId: req.userId!, type: 'SEND', status: 'CONFIRMED',
        amountUsdc: amount, stellarTxId: hash,
        toAddress: recipient.stellarPubKey, memo: memo ?? toPhone,
      }});
      await prisma.transaction.create({ data: {
        userId: recipient.id, type: 'RECEIVE', status: 'CONFIRMED',
        amountUsdc: amount, stellarTxId: hash, memo: `From ${sender.phone}`,
      }});

      await notify.moneySent(req.userId!, `$${amount} USDC`, toPhone);
      await notify.moneyReceived(recipient.id, `$${amount} USDC`, sender.phone);

      return res.json(ok({ type: 'direct', hash, message: 'Sent successfully' }));
    } catch (e: any) {
      return res.status(502).json(fail(e.message));
    }
  }

  // Recipient not registered — create pending claim
  const claimToken  = crypto.randomBytes(32).toString('hex');
  const expiresAt   = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours
  const claimUrl    = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/claim/${claimToken}`;

  // Hold funds in platform wallet
  try {
    await contractTransfer({
      fromEncryptedSecret: sender.stellarSecret,
      fromPin:             pin,
      fromPhone:           sender.phone,
      fromPublicKey:       sender.stellarPubKey,
      toPublicKey:         process.env.FEE_ACCOUNT!,
      amountUsdc:          amount,
      memo:                `Escrow for ${toPhone}`,
    });
  } catch (e: any) {
    return res.status(502).json(fail(e.message));
  }

  await prisma.pendingClaim.create({ data: {
    senderId: req.userId!, toPhone, claimToken, amountUsdc: amount, expiresAt,
  }});

  // Send SMS invite
  const smsText = claimSmsMessage(sender.phone, amount, claimUrl);
  await sendSms(toPhone, smsText);

  return res.json(ok({
    type:      'pending_claim',
    claimToken,
    claimUrl,
    expiresAt,
    message:   `SMS sent to ${toPhone}. Funds held for 72 hours.`,
  }));
});

// ── GET /api/contacts/pending-claims ─────────────────────────────────────────

router.get('/pending-claims', requireAuth, async (req: AuthRequest, res) => {
  const claims = await prisma.pendingClaim.findMany({
    where:   { senderId: req.userId!, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(ok({ claims }));
});

// ── POST /api/contacts/claim/:token ──────────────────────────────────────────
// Recipient claims their funds after registering.

router.post('/claim/:token', requireAuth, async (req: AuthRequest, res) => {
  const claim = await prisma.pendingClaim.findUnique({
    where: { claimToken: req.params.token },
  });

  if (!claim || claim.status !== 'PENDING') {
    return res.status(404).json(fail('Claim not found or already used'));
  }
  if (new Date() > claim.expiresAt) {
    await prisma.pendingClaim.update({ where: { id: claim.id }, data: { status: 'EXPIRED' } });
    return res.status(410).json(fail('Claim expired / Muda wa kudai umekwisha'));
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));

  // Verify the claim belongs to this phone number
  if (user.phone !== claim.toPhone) {
    return res.status(403).json(fail('This claim is not for your phone number'));
  }

  try {
    const hash = await platformSendUsdc(user.stellarPubKey, claim.amountUsdc, 'Claimed funds');
    await prisma.pendingClaim.update({
      where: { id: claim.id },
      data:  { status: 'CLAIMED', claimedAt: new Date() },
    });
    await prisma.transaction.create({ data: {
      userId: req.userId!, type: 'RECEIVE', status: 'CONFIRMED',
      amountUsdc: claim.amountUsdc, stellarTxId: hash, memo: 'Claimed via SMS link',
    }});
    await notify.moneyReceived(req.userId!, `$${claim.amountUsdc} USDC`, 'Pending claim');
    return res.json(ok({ message: 'Funds claimed!', amountUsdc: claim.amountUsdc, hash }));
  } catch (e: any) {
    return res.status(502).json(fail(e.message));
  }
});

export { router as contactsRouter };
