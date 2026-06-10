import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { haversineKm, etaMinutes } from '../lib/geo';

const router = Router();

// ── GET /api/vendors/products ─ catalog for search filters (brands/sizes) ────────
router.get('/products', async (_req, res) => {
  const products = await prisma.product.findMany({ orderBy: [{ type: 'asc' }, { brand: 'asc' }, { sizeKg: 'asc' }] });
  const brands = [...new Set(products.map(p => p.brand))];
  const sizes  = [...new Set(products.filter(p => p.sizeKg).map(p => p.sizeKg!))].sort((a, b) => a - b);
  res.json({ products, brands, sizes });
});

// ── GET /api/vendors/search ─ nearby vendors that HAVE stock, with price + ETA ───
router.get('/search', requireAuth, async (req, res) => {
  const parse = z.object({
    lat:      z.coerce.number(),
    lng:      z.coerce.number(),
    brand:    z.string().optional(),
    type:     z.enum(['REFILL', 'CYLINDER', 'ACCESSORY']).optional(),
    sizeKg:   z.coerce.number().optional(),
    radiusKm: z.coerce.number().min(1).max(50).default(15),
  }).safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: 'lat and lng are required' });

  const { lat, lng, brand, type, sizeKg, radiusKm } = parse.data;

  const productWhere: any = {};
  if (brand)  productWhere.brand  = brand;
  if (type)   productWhere.type   = type;
  if (sizeKg) productWhere.sizeKg = sizeKg;

  const suppliers = await prisma.supplierProfile.findMany({
    where: {
      isOpen: true,
      lat: { not: null },
      lng: { not: null },
      inventory: { some: { isAvailable: true, stock: { gt: 0 }, ...(Object.keys(productWhere).length ? { product: productWhere } : {}) } },
    },
    include: {
      inventory: {
        where:   { isAvailable: true, stock: { gt: 0 }, ...(Object.keys(productWhere).length ? { product: productWhere } : {}) },
        include: { product: true },
      },
    },
  });

  // Price caps for flagging EWURA-overpriced listings.
  const caps = await prisma.priceCap.findMany();
  const capFor = (region: string, productId: string) =>
    caps.find(c => c.region === region && (c.productId === productId || c.productId === null))?.maxPrice ?? null;

  const results = suppliers
    .map(s => {
      const km = haversineKm(lat, lng, s.lat!, s.lng!);
      const items = s.inventory.map(inv => {
        const cap = capFor(s.region, inv.productId);
        return {
          inventoryId: inv.id,
          productId:   inv.productId,
          brand:       inv.product.brand,
          name:        inv.product.name,
          type:        inv.product.type,
          sizeKg:      inv.product.sizeKg,
          price:       inv.price,
          stock:       inv.stock,
          overCap:     cap != null && inv.price > cap,
          maxPrice:    cap,
        };
      }).sort((a, b) => a.price - b.price);

      return {
        supplierId:   s.id,
        businessName: s.businessName,
        region:       s.region,
        district:     s.district,
        logoUrl:      s.logoUrl,
        isVerified:   s.isVerified,
        featured:     s.featured,
        rating:       s.rating,
        ratingCount:  s.ratingCount,
        lat:          s.lat,
        lng:          s.lng,
        distanceKm:   Math.round(km * 10) / 10,
        etaMin:       etaMinutes(km),
        fromPrice:    items[0]?.price ?? null,
        items,
      };
    })
    .filter(s => s.distanceKm <= radiusKm)
    // Featured + verified float up, then nearest, then cheapest.
    .sort((a, b) =>
      Number(b.featured) - Number(a.featured) ||
      a.distanceKm - b.distanceKm ||
      (a.fromPrice ?? 1e9) - (b.fromPrice ?? 1e9),
    );

  res.json({ count: results.length, vendors: results });
});

// ── GET /api/vendors/:id ─ full vendor profile + catalog ─────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  const s = await prisma.supplierProfile.findUnique({
    where:   { id: req.params.id },
    include: { inventory: { where: { isAvailable: true }, include: { product: true } } },
  });
  if (!s) return res.status(404).json({ error: 'Vendor not found' });
  res.json({ vendor: s });
});

export { router as vendorsRouter };
