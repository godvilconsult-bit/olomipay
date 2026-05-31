import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { encryptSecret } from '../services/crypto';

const router = Router();
const prisma = new PrismaClient();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

// ── GET /api/chat/keys/my ─────────────────────────────────────────────────────
// Returns user's encrypted secret key — frontend decrypts with PIN
router.get('/keys/my', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.userId! },
    select: { chatPublicKey: true, chatSecretKeyEnc: true, phone: true },
  });
  if (!user) return res.status(404).json(fail('User not found'));
  return res.json(ok(user));
});

// ── POST /api/chat/keys/generate ──────────────────────────────────────────────
// Generate NaCl keypair for a user (called after registration or on first chat open)
router.post('/keys/generate', requireAuth, async (req: AuthRequest, res) => {
  const { pin } = req.body;

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json(fail('User not found'));

  // Generate NaCl box keypair
  const kp = nacl.box.keyPair();
  const publicKey  = encodeBase64(kp.publicKey);
  const secretKeyB64 = encodeBase64(kp.secretKey);

  // Encrypt secret key with user's PIN (same pattern as Stellar key)
  const encryptedSecret = encryptSecret(secretKeyB64, pin ?? '000000', user.phone);

  await prisma.user.update({
    where: { id: req.userId! },
    data:  { chatPublicKey: publicKey, chatSecretKeyEnc: encryptedSecret },
  });

  return res.json(ok({
    publicKey,
    encryptedSecretKey: encryptedSecret,
    message: 'Chat encryption keys generated',
  }));
});

// ── GET /api/chat/users/:id/pubkey ─────────────────────────────────────────────
router.get('/users/:id/pubkey', async (req, res) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.params.id },
    select: { chatPublicKey: true, isOnline: true, lastSeenAt: true },
  });
  if (!user) return res.status(404).json(fail('User not found'));
  return res.json(ok(user));
});

// ── GET /api/chat/users/search ────────────────────────────────────────────────
router.get('/users/search', requireAuth, async (req: AuthRequest, res) => {
  const q = (req.query.q as string ?? '').trim();
  if (q.length < 3) return res.status(400).json(fail('Search query too short'));

  const users = await prisma.user.findMany({
    where: {
      AND: [
        { id: { not: req.userId! } },
        {
          OR: [
            { phone: { contains: q } },
            { kycName: { contains: q, mode: 'insensitive' } },
          ],
        },
      ],
    },
    select: { id: true, kycName: true, phone: true, chatPublicKey: true, isOnline: true, lastSeenAt: true },
    take: 20,
  });

  // Mask phone: +255****1234
  const masked = users.map(u => ({
    ...u,
    phone: u.phone.slice(0, 5) + '****' + u.phone.slice(-4),
  }));

  return res.json(ok({ users: masked }));
});

// ── GET /api/chat/conversations ───────────────────────────────────────────────
router.get('/conversations', requireAuth, async (req: AuthRequest, res) => {
  const memberships = await prisma.conversationMember.findMany({
    where:   { userId: req.userId!, isArchived: false },
    include: {
      conversation: {
        include: {
          participants: {
            include: { user: { select: { id: true, kycName: true, phone: true, chatPublicKey: true, isOnline: true, lastSeenAt: true } } },
          },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: 'desc' } },
  });

  const conversations = await Promise.all(memberships.map(async m => {
    const conv = m.conversation;
    const unreadCount = await prisma.message.count({
      where: {
        conversationId: conv.id,
        senderId:       { not: req.userId! },
        isDeleted:      false,
        createdAt:      { gt: m.lastReadAt ?? new Date(0) },
      },
    });

    const other = conv.participants
      .filter(p => p.userId !== req.userId!)
      .map(p => p.user);

    return { ...conv, unreadCount, otherParticipants: other, isMuted: m.isMuted };
  }));

  return res.json(ok({ conversations }));
});

// ── POST /api/chat/conversations ──────────────────────────────────────────────
router.post('/conversations', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    toPhone:    z.string().optional(),
    toUserId:   z.string().optional(),
    type:       z.enum(['DIRECT', 'GROUP']).default('DIRECT'),
    groupName:  z.string().optional(),
    memberPhones: z.array(z.string()).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail(parse.error.errors[0].message));

  const { type, groupName, toPhone, toUserId, memberPhones } = parse.data;

  if (type === 'DIRECT') {
    // Find target user
    let target = toUserId
      ? await prisma.user.findUnique({ where: { id: toUserId } })
      : await prisma.user.findUnique({ where: { phone: toPhone } });

    if (!target) return res.status(404).json(fail('Mtumiaji hakupatikana. Waambie kusajili Tuma kwanza.'));
    if (target.id === req.userId) return res.status(400).json(fail('Huwezi kuzungumza na wewe mwenyewe.'));

    // Check block
    const blocked = await prisma.blockedUser.findUnique({
      where: { blockerId_blockedId: { blockerId: target.id, blockedId: req.userId! } },
    });
    if (blocked) return res.status(403).json(fail('Huwezi kuzungumza na mtumiaji huyu.'));

    // Find existing direct conversation
    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { participants: { some: { userId: req.userId! } } },
          { participants: { some: { userId: target.id } } },
        ],
      },
      include: { participants: { include: { user: { select: { id: true, kycName: true, phone: true, chatPublicKey: true, isOnline: true } } } } },
    });

    if (existing) return res.json(ok({ conversation: existing, isNew: false }));

    // Create new conversation
    const conversation = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        participants: {
          create: [
            { userId: req.userId! },
            { userId: target.id },
          ],
        },
        messages: {
          create: {
            senderId:     req.userId!,
            type:         'SYSTEM',
            plainContent: `Umeunganishwa na ${target.kycName ?? target.phone} kwenye Tuma 🌟`,
          },
        },
      },
      include: { participants: { include: { user: { select: { id: true, kycName: true, phone: true, chatPublicKey: true, isOnline: true } } } } },
    });

    return res.status(201).json(ok({ conversation, isNew: true }));
  }

  // GROUP conversation
  if (!groupName) return res.status(400).json(fail('Jina la kikundi linahitajika.'));

  const phones  = memberPhones ?? [];
  const members = await prisma.user.findMany({ where: { phone: { in: phones } } });

  const conversation = await prisma.conversation.create({
    data: {
      type:        'GROUP',
      groupName,
      groupAdminId: req.userId!,
      participants: {
        create: [
          { userId: req.userId! },
          ...members.map(m => ({ userId: m.id })),
        ],
      },
    },
    include: { participants: { include: { user: { select: { id: true, kycName: true, phone: true, isOnline: true } } } } },
  });

  return res.status(201).json(ok({ conversation, isNew: true }));
});

// ── GET /api/chat/conversations/:id/messages ──────────────────────────────────
router.get('/conversations/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const before  = req.query.before as string | undefined;
  const limit   = Math.min(parseInt(req.query.limit as string ?? '50'), 100);

  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: req.userId! } },
  });
  if (!member) return res.status(403).json(fail('Huna ruhusa.'));

  const messages = await prisma.message.findMany({
    where: {
      conversationId: id,
      isDeleted:      false,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    include: {
      sender:   { select: { id: true, kycName: true, phone: true, chatPublicKey: true } },
      receipts: { select: { userId: true, readAt: true } },
      replyTo:  { select: { id: true, encryptedContent: true, senderId: true, type: true } },
    },
    orderBy: { createdAt: 'desc' },
    take:    limit,
  });

  // Mark delivered
  await prisma.message.updateMany({
    where:  { conversationId: id, senderId: { not: req.userId! }, deliveredAt: null },
    data:   { deliveredAt: new Date() },
  }).catch(() => {});

  return res.json(ok({ messages: messages.reverse(), hasMore: messages.length === limit }));
});

// ── POST /api/chat/conversations/:id/read ─────────────────────────────────────
router.post('/conversations/:id/read', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: id, userId: req.userId! } },
    data:  { lastReadAt: new Date() },
  }).catch(() => {});
  return res.json(ok({ message: 'Read' }));
});

// ── DELETE /api/chat/messages/:id ─────────────────────────────────────────────
router.delete('/messages/:id', requireAuth, async (req: AuthRequest, res) => {
  const message = await prisma.message.findUnique({ where: { id: req.params.id } });
  if (!message || message.senderId !== req.userId) {
    return res.status(403).json(fail('Huwezi kufuta ujumbe huu.'));
  }
  if (Date.now() - message.createdAt.getTime() > 60_000) {
    return res.status(400).json(fail('Muda wa kufuta umepita.'));
  }
  await prisma.message.update({
    where: { id: req.params.id },
    data:  { isDeleted: true, deletedAt: new Date(), encryptedContent: null },
  });
  return res.json(ok({ message: 'Deleted' }));
});

// ── POST /api/chat/users/:id/block ────────────────────────────────────────────
router.post('/users/:id/block', requireAuth, async (req: AuthRequest, res) => {
  await prisma.blockedUser.upsert({
    where:  { blockerId_blockedId: { blockerId: req.userId!, blockedId: req.params.id } },
    update: {},
    create: { blockerId: req.userId!, blockedId: req.params.id },
  });
  return res.json(ok({ message: 'Mtumiaji amezuiwa.' }));
});

// ── POST /api/chat/users/:id/unblock ─────────────────────────────────────────
router.post('/users/:id/unblock', requireAuth, async (req: AuthRequest, res) => {
  await prisma.blockedUser.deleteMany({
    where: { blockerId: req.userId!, blockedId: req.params.id },
  });
  return res.json(ok({ message: 'Mtumiaji amefunguliwa.' }));
});

export { router as chatRouter };
