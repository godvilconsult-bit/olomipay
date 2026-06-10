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
