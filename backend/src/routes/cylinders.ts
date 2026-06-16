/**
 * Cylinder registry + deposit/return. A household records the gas cylinder(s) it
 * holds (brand + size, with any refundable deposit). When they want to give a
 * cylinder back, they request a return; an admin approves it and the deposit is
 * refunded to their wallet. Knowing the household's brand also powers the
 * "refills must match your cylinder brand" guidance on the home screen.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole, AuthRequest } from '../middleware/auth';
import { notify } from '../services/notify';

const router = Router();

// ── GET /api/cylinders/mine ─ the household's cylinders ───────────────────────────
router.get('/mine', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const cylinders = await prisma.cylinder.findMany({
    where:   { ownerId: req.userId, status: { notIn: ['RETURNED', 'RETIRED'] } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ cylinders });
});

// ── POST /api/cylinders ─ register a cylinder I hold ──────────────────────────────
router.post('/', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const parse = z.object({
    brand:   z.string().min(1).max(60),
    sizeKg:  z.coerce.number().positive().max(100),
    deposit: z.coerce.number().int().min(0).max(1_000_000).default(0),
    serial:  z.string().max(60).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { region: true } });
  const cylinder = await prisma.cylinder.create({
    data: { ownerId: req.userId!, brand: parse.data.brand, sizeKg: parse.data.sizeKg, deposit: parse.data.deposit, serial: parse.data.serial || null, status: 'WITH_HOUSEHOLD', region: me?.region ?? null },
  });
  res.status(201).json({ cylinder });
});

// ── DELETE /api/cylinders/:id ─ remove a cylinder I mistakenly added (no deposit) ─
router.delete('/:id', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const c = await prisma.cylinder.findFirst({ where: { id: req.params.id, ownerId: req.userId } });
  if (!c) return res.status(404).json({ error: 'Cylinder not found' });
  if (c.status === 'RETURN_REQUESTED') return res.status(400).json({ error: 'A return is already in progress' });
  await prisma.cylinder.delete({ where: { id: c.id } });
  res.json({ ok: true });
});

// ── POST /api/cylinders/:id/return ─ request to return a cylinder + reclaim deposit ─
router.post('/:id/return', requireRole('HOUSEHOLD'), async (req: AuthRequest, res) => {
  const c = await prisma.cylinder.findFirst({ where: { id: req.params.id, ownerId: req.userId } });
  if (!c) return res.status(404).json({ error: 'Cylinder not found' });
  if (c.status !== 'WITH_HOUSEHOLD') return res.status(400).json({ error: 'This cylinder is not eligible for return' });
  await prisma.cylinder.update({ where: { id: c.id }, data: { status: 'RETURN_REQUESTED' } });

  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  await Promise.all(admins.map((a) => notify(a.id, {
    title: '🛢️ Cylinder return request',
    body:  `A household wants to return a ${c.brand} ${c.sizeKg}kg cylinder (deposit TZS ${c.deposit.toLocaleString()}).`,
    type:  'cylinder',
    data:  { cylinderId: c.id },
  }).catch(() => {})));
  res.json({ ok: true });
});

export { router as cylindersRouter };
