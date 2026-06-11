import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const addresses = await prisma.address.findMany({ where: { userId: req.userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
  res.json({ addresses });
});

const addrSchema = z.object({
  label:     z.string().max(60).default('Home'),
  lat:       z.number(),
  lng:       z.number(),
  street:    z.string().max(120).optional(),
  ward:      z.string().max(60).optional(),
  district:  z.string().max(60).optional(),
  region:    z.string().max(60).optional(),
  isDefault: z.boolean().optional(),
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const parse = addrSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  const count = await prisma.address.count({ where: { userId: req.userId } });
  const makeDefault = parse.data.isDefault || count === 0;
  if (makeDefault) await prisma.address.updateMany({ where: { userId: req.userId }, data: { isDefault: false } });

  const { label, lat, lng, street, ward, district, region } = parse.data;
  const address = await prisma.address.create({
    data: { userId: req.userId!, label, lat, lng, street, ward, district, region, isDefault: makeDefault },
  });
  res.status(201).json({ address });
});

// ── POST /api/addresses/current ─ set/update the single saved delivery location ──
// Upserts the user's DEFAULT address to the given coords. This is the one
// canonical "saved location" every page reads from.
router.post('/current', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    lat: z.number(), lng: z.number(),
    label: z.string().max(60).optional(),
    region: z.string().max(60).optional(),
    district: z.string().max(60).optional(),
    ward: z.string().max(120).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { lat, lng, label, region, district, ward } = parse.data;

  const existing = await prisma.address.findFirst({ where: { userId: req.userId, isDefault: true } })
    ?? await prisma.address.findFirst({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' } });

  let address;
  if (existing) {
    address = await prisma.address.update({
      where: { id: existing.id },
      data: { lat, lng, isDefault: true, ...(label && { label }), ...(region && { region }), ...(district && { district }), ...(ward && { ward }) },
    });
  } else {
    address = await prisma.address.create({
      data: { userId: req.userId!, label: label ?? 'Home', lat, lng, region, district, ward, isDefault: true },
    });
  }
  await prisma.address.updateMany({ where: { userId: req.userId, id: { not: address.id } }, data: { isDefault: false } });
  res.json({ address });
});

router.post('/:id/default', requireAuth, async (req: AuthRequest, res) => {
  const owned = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!owned) return res.status(404).json({ error: 'Address not found' });
  await prisma.address.updateMany({ where: { userId: req.userId }, data: { isDefault: false } });
  await prisma.address.update({ where: { id: req.params.id }, data: { isDefault: true } });
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  await prisma.address.deleteMany({ where: { id: req.params.id, userId: req.userId } });
  res.json({ ok: true });
});

export { router as addressesRouter };
