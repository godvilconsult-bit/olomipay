/**
 * Seller listings — create a product in any category and offer it for sale.
 *
 * This is what makes the marketplace general. Until now a seller could only
 * stock items from a fixed, seeded gas catalog: there was no way to bring a new
 * product into existence, so the storefront could only ever show LPG no matter
 * what the schema allowed.
 *
 * Products are shared catalog entries; Offers are per-seller. Two shops listing
 * the same product should attach to one product record so the product page can
 * compare them — that is the whole point of splitting the two.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { actingOrgId } from '../services/freight';
import { toMinor, fromMinor } from '../lib/money';
import { normaliseTiers } from '../lib/pricing';

const router = Router();

const handle = (res: any, e: any) =>
  res.status(e?.http ?? 500).json({ error: e?.message ?? 'Request failed' });

/**
 * Light validation against the category's attributeSchema: required keys must
 * be present and non-empty, and declared types must roughly match.
 *
 * Deliberately not a full JSON-Schema validator — that would mean adding ajv
 * for a check that mainly guards typos. Categories still describe themselves,
 * so the UI can render the right fields.
 */
function checkAttributes(schema: any, attrs: Record<string, unknown>): string | null {
  if (!schema || typeof schema !== 'object') return null;
  for (const key of (schema.required ?? []) as string[]) {
    const v = attrs[key];
    if (v === undefined || v === null || v === '') return `Missing required attribute: ${key}`;
  }
  const props = schema.properties ?? {};
  for (const [key, value] of Object.entries(attrs)) {
    const want = props[key]?.type;
    if (!want) continue;
    if (want === 'number' && typeof value !== 'number') return `Attribute "${key}" must be a number`;
    if (want === 'string' && typeof value !== 'string') return `Attribute "${key}" must be text`;
  }
  return null;
}

export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES_TOTAL = 50 * 1024 * 1024; // 50 MB across all images

/** Decoded byte size of a data URL (or raw length for a plain URL). */
function imageBytes(src: string): number {
  const comma = src.indexOf(',');
  if (!src.startsWith('data:') || comma < 0) return src.length;
  const b64 = src.slice(comma + 1);
  // base64 encodes 3 bytes per 4 chars, minus padding.
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/** Returns an error message, or null when the gallery is acceptable. */
export function checkImages(images: string[]): string | null {
  if (images.length > MAX_IMAGES) return `At most ${MAX_IMAGES} images per product`;
  const total = images.reduce((n, src) => n + imageBytes(src), 0);
  if (total > MAX_IMAGE_BYTES_TOTAL) {
    const mb = (total / (1024 * 1024)).toFixed(1);
    return `Images total ${mb} MB — the limit is 50 MB for all images combined`;
  }
  return null;
}

async function sellerOrg(userId: string) {
  const orgId = await actingOrgId(userId);
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org?.canSell) {
    throw Object.assign(new Error('Your organization is not set up to sell'), { http: 403 });
  }
  return org;
}

// ── GET /api/listings/categories ─ where a product can go ────────────────────
// Only leaves accept products; parents exist for browsing.
router.get('/categories', requireAuth, async (_req: AuthRequest, res) => {
  const all = await prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  const parentIds = new Set(all.map(c => c.parentId).filter(Boolean) as string[]);
  const byId = new Map(all.map(c => [c.id, c]));

  res.json({
    categories: all
      .filter(c => !parentIds.has(c.id))
      .map(c => ({
        id: c.id, key: c.key, name: c.name, unitType: c.unitType,
        attributeSchema: c.attributeSchema,
        path: c.parentId ? `${byId.get(c.parentId)?.name ?? ''} › ${c.name}` : c.name,
      })),
  });
});

// ── POST /api/listings/products ─ bring a product into existence ─────────────
router.post('/products', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    categoryId:  z.string().min(1),
    name:        z.string().trim().min(2).max(140),
    attributes:  z.record(z.any()).default({}),
    description: z.string().trim().max(5_000).optional(),
    images:      z.array(z.string()).max(MAX_IMAGES).default([]),
    gtin:        z.string().trim().max(20).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { categoryId, name, attributes, description, images, gtin } = parse.data as {
    categoryId: string; name: string; attributes: Record<string, unknown>;
    description?: string; images: string[]; gtin?: string;
  };

  const imageProblem = checkImages(images);
  if (imageProblem) return res.status(413).json({ error: imageProblem });

  // The first image doubles as the card thumbnail, so existing product cards
  // and storefront tiles keep working without knowing about galleries.
  const imageUrl = images[0];

  try {
    const org = await sellerOrg(req.userId!);
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const problem = checkAttributes(category.attributeSchema, attributes);
    if (problem) return res.status(400).json({ error: problem });

    // A barcode identifies the same physical product across sellers, so reuse
    // the existing record rather than forking the catalog.
    if (gtin) {
      const existing = await prisma.product.findFirst({ where: { gtin } });
      if (existing) return res.status(200).json({ product: existing, reused: true });
    }

    const product = await prisma.product.create({
      data: {
        categoryId, name, attributes: attributes as any,
        description, images: images.length ? (images as any) : undefined,
        imageUrl, gtin,
        ownerOrgId: org.id,
        // Legacy gas columns are still non-null in the schema until phase 8
        // contracts them; mirror what we can so old queries keep working.
        brand: typeof attributes.brand === 'string' ? attributes.brand : org.name,
        type:  'ACCESSORY',
        sizeKg: typeof attributes.sizeKg === 'number' ? attributes.sizeKg : null,
      },
    });
    res.status(201).json({ product });
  } catch (e) { handle(res, e); }
});

// ── POST /api/listings/offers ─ put it on sale ───────────────────────────────
router.post('/offers', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    productId: z.string().min(1),
    price:     z.coerce.number().nonnegative(),   // major units, as typed
    currency:  z.string().length(3).optional(),
    stock:     z.coerce.number().int().nonnegative().default(0),
    moq:       z.coerce.number().int().min(1).default(1),
    isAvailable: z.boolean().default(true),
    // [{ minQty, price }] in major units; converted below like every other price.
    tiers: z.array(z.object({ minQty: z.coerce.number().int().min(1), price: z.coerce.number().nonnegative() })).max(8).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });
  const { productId, price, stock, moq, isAvailable } = parse.data as any;
  const rawTiers = (parse.data as any).tiers as { minQty: number; price: number }[] | undefined;

  try {
    const org = await sellerOrg(req.userId!);
    const currency = parse.data.currency ?? org.currency;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Sorted and validated before storage so readers never have to.
    const tierData = rawTiers?.length
      ? (normaliseTiers(rawTiers.map(t => ({ minQty: t.minQty, priceMinor: toMinor(t.price, currency) }))) as any)
      : undefined;

    const offer = await prisma.offer.upsert({
      where:  { sellerOrgId_productId: { sellerOrgId: org.id, productId } },
      update: { priceMinor: toMinor(price, currency), currency, stock, moq, isAvailable, tiers: tierData },
      create: { sellerOrgId: org.id, productId, priceMinor: toMinor(price, currency), currency, stock, moq, isAvailable, tiers: tierData },
    });
    res.status(201).json({ offer: { ...offer, price: fromMinor(offer.priceMinor, offer.currency) } });
  } catch (e) { handle(res, e); }
});

// ── GET /api/listings/mine ─ what I sell ─────────────────────────────────────
router.get('/mine', requireAuth, async (req: AuthRequest, res) => {
  try {
    const org = await sellerOrg(req.userId!);
    const offers = await prisma.offer.findMany({
      where:   { sellerOrgId: org.id },
      orderBy: { updatedAt: 'desc' },
      include: { product: { include: { category: { select: { key: true, name: true } } } } },
    });
    res.json({
      sellerSlug: org.slug,
      listings: offers.map(o => ({
        id: o.id, price: fromMinor(o.priceMinor, o.currency), priceMinor: o.priceMinor,
        currency: o.currency, stock: o.stock, moq: o.moq, isAvailable: o.isAvailable,
        product: {
          id: o.product.id, name: o.product.name, imageUrl: o.product.imageUrl,
          attributes: o.product.attributes, category: o.product.category,
        },
      })),
    });
  } catch (e) { handle(res, e); }
});

// ── DELETE /api/listings/offers/:id ─ stop selling ───────────────────────────
router.delete('/offers/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const org = await sellerOrg(req.userId!);
    const offer = await prisma.offer.findUnique({ where: { id: req.params.id } });
    if (!offer) return res.status(404).json({ error: 'Listing not found' });
    if (offer.sellerOrgId !== org.id) return res.status(403).json({ error: 'That listing is not yours' });

    await prisma.offer.delete({ where: { id: offer.id } });
    res.json({ ok: true });
  } catch (e) { handle(res, e); }
});

// ── GET/PUT /api/listings/store ─ the seller's own storefront details ────────
router.get('/store', requireAuth, async (req: AuthRequest, res) => {
  try {
    const org = await sellerOrg(req.userId!);
    res.json({ store: org });
  } catch (e) { handle(res, e); }
});

router.put('/store', requireAuth, async (req: AuthRequest, res) => {
  const parse = z.object({
    name:         z.string().trim().min(2).max(120).optional(),
    description:  z.string().trim().max(2_000).optional(),
    logoUrl:      z.string().max(2_000_000).optional(),
    addressLine1: z.string().trim().max(160).optional(),
    addressLine2: z.string().trim().max(160).optional(),
    city:         z.string().trim().max(80).optional(),
    state:        z.string().trim().max(80).optional(),
    postalCode:   z.string().trim().max(20).optional(),
    countryCode:  z.string().length(2).optional(),
    contactPhone: z.string().trim().max(30).optional(),
    contactEmail: z.string().trim().email().max(160).optional(),
    lat:          z.coerce.number().min(-90).max(90).optional(),
    lng:          z.coerce.number().min(-180).max(180).optional(),
  }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.errors[0].message });

  try {
    const org = await sellerOrg(req.userId!);
    const data: any = { ...parse.data };
    if (data.countryCode) data.countryCode = data.countryCode.toUpperCase();

    const updated = await prisma.organization.update({ where: { id: org.id }, data });
    res.json({ store: updated });
  } catch (e) { handle(res, e); }
});

export { router as listingsRouter };
