import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { encryptSecret } from '../services/crypto';
import { emitToUser } from '../socket';

const router = Router();
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
  const q       = (req.query.q as string ?? '').trim();
  const myId    = req.userId!;

  // Privacy: never expose the whole user directory. Require a real search term;
  // users find each other by name, phone, or account number — not by browsing.
  if (q.length < 2) {
    return res.json(ok({ users: [] }));
  }

  // Account-number search (OP-XXXX) is uppercased to match stored format.
  const qUpper = q.toUpperCase();

  try {
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: myId } },
          { OR: [
            { phone:     { contains: q } },
            { kycName:   { contains: q, mode: 'insensitive' } },
            { accountNo: { contains: qUpper } },
          ]},
        ],
      },
      select: {
        id:           true,
        kycName:      true,
        phone:        true,
        chatPublicKey: true,
        isOnline:     true,
        lastSeenAt:   true,
        createdAt:    true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take:    100,
    });

    const result = users.map(u => ({
      id:            u.id,
      kycName:       u.kycName,
      chatPublicKey: u.chatPublicKey,
      isOnline:      u.isOnline ?? false,
      lastSeenAt:    u.lastSeenAt,
      // Show full phone if it's an exact phone search (so user can confirm)
      phoneMasked:   q.length >= 9 && u.phone.includes(q.replace(/\s/g, ''))
                       ? u.phone
                       : u.phone.slice(0, 5) + '****' + u.phone.slice(-4),
      displayName:   u.kycName ?? (u.phone.slice(0, 5) + '****' + u.phone.slice(-4)),
    }));

    console.log(`[chat/search] myId=${myId} q="${q}" found=${result.length}`);
    return res.json(ok({ users: result }));
  } catch (e: any) {
    console.error('[chat/search] error:', e.message);
    return res.status(500).json(fail('Search failed: ' + e.message));
  }
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

    if (!target) return res.status(404).json(fail('User not found. Ask them to register on Tuma first.'));
    if (target.id === req.userId) return res.status(400).json(fail('You cannot chat with yourself.'));

    // Check block
    const blocked = await prisma.blockedUser.findUnique({
      where: { blockerId_blockedId: { blockerId: target.id, blockedId: req.userId! } },
    });
    if (blocked) return res.status(403).json(fail('You cannot chat with this user.'));

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

    if (existing) {
      // Shape existing conversation for frontend
      const myId = req.userId!;
      const shaped = {
        ...existing,
        otherParticipants: existing.participants
          .filter(p => p.userId !== myId)
          .map(p => ({
            ...p.user,
            phoneMasked:  p.user.phone.slice(0, 5) + '****' + p.user.phone.slice(-4),
            displayName:  p.user.kycName ?? (p.user.phone.slice(0, 5) + '****' + p.user.phone.slice(-4)),
          })),
        unreadCount: 0,
      };
      return res.json(ok({ conversation: shaped, isNew: false }));
    }

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
            plainContent: `You are now connected with ${target.kycName ?? target.phone} on OlomiPay 🌟`,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, kycName: true, phone: true, chatPublicKey: true, isOnline: true, lastSeenAt: true } },
          },
        },
      },
    });

    const myId = req.userId!;

    // Shape the response with otherParticipants (what frontend expects)
    const shaped = {
      ...conversation,
      otherParticipants: conversation.participants
        .filter(p => p.userId !== myId)
        .map(p => ({
          ...p.user,
          phoneMasked:  p.user.phone.slice(0, 5) + '****' + p.user.phone.slice(-4),
          displayName:  p.user.kycName ?? (p.user.phone.slice(0, 5) + '****' + p.user.phone.slice(-4)),
        })),
      unreadCount: 0,
    };

    // Notify the OTHER user in real-time so their conversation list updates
    // without needing a page refresh
    emitToUser(target.id, 'new_conversation', shaped);

    return res.status(201).json(ok({ conversation: shaped, isNew: true }));
  }

  // GROUP conversation
  if (!groupName) return res.status(400).json(fail('Group name is required.'));

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
  if (!member) return res.status(403).json(fail('Access denied.'));

  // "Delete for me" — message ids this user has hidden
  let hiddenIds: string[] = [];
  try {
    const rows = await prisma.$queryRawUnsafe<{ messageId: string }[]>(
      `SELECT "messageId" FROM "MessageHidden" WHERE "userId" = $1`, req.userId!,
    );
    hiddenIds = rows.map(r => r.messageId);
  } catch { /* table may not exist yet — ignore */ }

  const messages = await prisma.message.findMany({
    where: {
      conversationId: id,
      isDeleted:      false,
      ...(hiddenIds.length ? { id: { notIn: hiddenIds } } : {}),
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

// ── POST /api/chat/messages/hide — "Delete for me" (one or many) ──────────────
router.post('/messages/hide', requireAuth, async (req: AuthRequest, res) => {
  const ids: string[] = Array.isArray(req.body?.messageIds) ? req.body.messageIds : [];
  if (ids.length === 0) return res.status(400).json(fail('No messages selected.'));
  try {
    for (const messageId of ids.slice(0, 200)) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "MessageHidden" ("messageId","userId") VALUES ($1,$2)
         ON CONFLICT ("messageId","userId") DO NOTHING`,
        messageId, req.userId!,
      ).catch(() => {});
    }
    return res.json(ok({ hidden: ids.length }));
  } catch (e: any) {
    return res.status(500).json(fail('Could not hide messages.'));
  }
});

// ── POST /api/chat/messages/delete — "Delete for everyone" (batch, own only) ──
router.post('/messages/delete', requireAuth, async (req: AuthRequest, res) => {
  const ids: string[] = Array.isArray(req.body?.messageIds) ? req.body.messageIds : [];
  if (ids.length === 0) return res.status(400).json(fail('No messages selected.'));

  const msgs = await prisma.message.findMany({ where: { id: { in: ids } } });
  const deletable = msgs.filter(m => m.senderId === req.userId && !m.isDeleted);

  await prisma.message.updateMany({
    where: { id: { in: deletable.map(m => m.id) } },
    data:  { isDeleted: true, deletedAt: new Date(), encryptedContent: null, plainContent: null },
  });

  return res.json(ok({
    deleted:    deletable.map(m => m.id),
    skipped:    ids.length - deletable.length,   // not yours / already deleted
  }));
});

// ── DELETE /api/chat/messages/:id ─────────────────────────────────────────────
router.delete('/messages/:id', requireAuth, async (req: AuthRequest, res) => {
  const message = await prisma.message.findUnique({ where: { id: req.params.id } });
  if (!message || message.senderId !== req.userId) {
    return res.status(403).json(fail('You cannot delete this message.'));
  }
  if (Date.now() - message.createdAt.getTime() > 60_000) {
    return res.status(400).json(fail('Delete window has expired (60 seconds).'));
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
  return res.json(ok({ message: 'User blocked.' }));
});

// ── POST /api/chat/users/:id/unblock ─────────────────────────────────────────
router.post('/users/:id/unblock', requireAuth, async (req: AuthRequest, res) => {
  await prisma.blockedUser.deleteMany({
    where: { blockerId: req.userId!, blockedId: req.params.id },
  });
  return res.json(ok({ message: 'User unblocked.' }));
});

export { router as chatRouter };
