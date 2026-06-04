import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const ok   = (data: any) => ({ success: true,  data });
const fail = (msg: string) => ({ success: false, error: msg });

const CATEGORIES = ['DEPOSIT', 'WITHDRAWAL', 'PAYMENT', 'WALLET', 'KYC', 'ACCOUNT', 'GENERAL'];

// ── POST /api/support/tickets — open a ticket ───────────────────────────────────
router.post('/tickets', requireAuth, async (req: AuthRequest, res) => {
  const subject  = String(req.body?.subject ?? '').trim().slice(0, 140);
  const body     = String(req.body?.body ?? '').trim().slice(0, 4000);
  const category = CATEGORIES.includes(req.body?.category) ? req.body.category : 'GENERAL';
  if (!subject) return res.status(400).json(fail('Please add a short subject'));
  if (!body)    return res.status(400).json(fail('Please describe your issue'));

  const [ticket] = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO "SupportTicket" ("userId","subject","category") VALUES ($1,$2,$3) RETURNING *`,
    req.userId!, subject, category,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SupportTicketMessage" ("ticketId","authorId","authorType","body") VALUES ($1,$2,'USER',$3)`,
    ticket.id, req.userId!, body,
  );
  return res.json(ok({ ticket }));
});

// ── GET /api/support/tickets — my tickets ───────────────────────────────────────
router.get('/tickets', requireAuth, async (req: AuthRequest, res) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "SupportTicket" WHERE "userId"=$1 ORDER BY "lastMessageAt" DESC LIMIT 100`, req.userId!,
  ).catch(() => []);
  return res.json(ok({ tickets: rows }));
});

// ── GET /api/support/tickets/:id — one ticket + thread ──────────────────────────
router.get('/tickets/:id', requireAuth, async (req: AuthRequest, res) => {
  const [ticket] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "SupportTicket" WHERE "id"=$1 AND "userId"=$2`, req.params.id, req.userId!,
  );
  if (!ticket) return res.status(404).json(fail('Ticket not found'));
  const messages = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "id","authorType","body","createdAt" FROM "SupportTicketMessage" WHERE "ticketId"=$1 ORDER BY "createdAt" ASC`, ticket.id,
  );
  // Mark as read for the user
  await prisma.$executeRawUnsafe(`UPDATE "SupportTicket" SET "unreadForUser"=false WHERE "id"=$1`, ticket.id).catch(() => {});
  return res.json(ok({ ticket, messages }));
});

// ── POST /api/support/tickets/:id/messages — reply ──────────────────────────────
router.post('/tickets/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  const body = String(req.body?.body ?? '').trim().slice(0, 4000);
  if (!body) return res.status(400).json(fail('Message is empty'));
  const [ticket] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "SupportTicket" WHERE "id"=$1 AND "userId"=$2`, req.params.id, req.userId!,
  );
  if (!ticket) return res.status(404).json(fail('Ticket not found'));

  await prisma.$executeRawUnsafe(
    `INSERT INTO "SupportTicketMessage" ("ticketId","authorId","authorType","body") VALUES ($1,$2,'USER',$3)`,
    ticket.id, req.userId!, body,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "SupportTicket" SET "lastMessageAt"=NOW(),"updatedAt"=NOW(),"unreadForAdmin"=true,
       "status"=CASE WHEN "status"='RESOLVED' THEN 'OPEN' ELSE "status" END WHERE "id"=$1`, ticket.id,
  );
  return res.json(ok({ message: 'Sent' }));
});

export { router as supportRouter };
