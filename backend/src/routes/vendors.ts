import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { haversineKm, etaMinutes } from '../lib/geo';

const router = Router();

/** Is the vendor open right now? Master toggle + optional EAT (UTC+3) hours. */
function openNow(s: { isOpen: boolean; openHour: number | null; closeHour: number | null }): boolean {
  if (!s.isOpen) return false;
  if (s.openHour == null || s.closeHour == null) return true;
  const hour = (new Date().getUTCHours() + 3) % 24; // East Africa Time, no DST
  return s.openHour <= s.closeHour
    ? hour >= s.openHour && hour < s.closeHour
    : hour >= s.openHour || hour < s.closeHour;      // overnight window
}

// ── GET /api/vendors/products ─ catalog for search filters (brands/sizes) ────────
// Cached in-memory (5 min): the catalog is near-static but hit on every load.
let catalogCache: { at: number; data: any } | null = null;
router.get('/products', async (_req, res) => {
  if (catalogCache && Date.now() - catalogCache.at < 300_000) return res.json(catalogCache.data);
  const products = await prisma.product.findMany({ orderBy: [{ type: 'asc' }, { brand: 'asc' }, { sizeKg: 'asc' }] });
  const brands = [...new Set(products.map(p => p.brand))];
  const sizes  = [...new Set(products.filter(p => p.sizeKg).map(p => p.sizeKg!))].sort((a, b) => a - b);
  const data = { products, brands, sizes };
  catalogCache = { at: Date.now(), data };
  res.json(data);
});

// ── GET /api/vendors/search ─ nearby vendors that HAVE stock, with price + ETA ───
router.get('/search', requireAuth, async (req: AuthRequest, res) => {
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

  // Bounding-box prefilter: lets Postgres use the (isOpen,lat,lng) index instead
  // of scanning every open vendor. The haversine pass below refines to the exact
  // circle, and the box is a superset of the circle so nothing is missed.
  const dLat = radiusKm / 111;
  const dLng = radiusKm / ((111 * Math.cos((lat * Math.PI) / 180)) || 1);

  const productWhere: any = {};
  if (brand)  productWhere.brand  = brand;
  if (type)   productWhere.type   = type;
  if (sizeKg) productWhere.sizeKg = sizeKg;

  const suppliers = await prisma.supplierProfile.findMany({
    where: {
      isOpen: true,
      lat: { gte: lat - dLat, lte: lat + dLat },
      lng: { gte: lng - dLng, lte: lng + dLng },
      // Show any open vendor with stock + a location. KYC adds a verified badge
      // (returned below) but does not hide the vendor from search.
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

  // The household's favourite vendors (to flag in results).
  const favIds = new Set((await prisma.favorite.findMany({ where: { userId: req.userId }, select: { supplierId: true } })).map(f => f.supplierId));

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
        openNow:      openNow(s),
        favorited:    favIds.has(s.id),
        items,
      };
    })
    .filter(s => s.distanceKm <= radiusKm && s.openNow)
    // Favourites + featured + verified float up, then nearest, then cheapest.
    .sort((a, b) =>
      Number(b.favorited) - Number(a.favorited) ||
      Number(b.featured) - Number(a.featured) ||
      a.distanceKm - b.distanceKm ||
      (a.fromPrice ?? 1e9) - (b.fromPrice ?? 1e9),
    );

  res.json({ count: results.length, vendors: results });
});

// ── GET /api/vendors/favorites ─ my favourite vendors (before /:id) ──────────────
router.get('/favorites', requireAuth, async (req: AuthRequest, res) => {
  const favs = await prisma.favorite.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' } });
  const sups = await prisma.supplierProfile.findMany({
    where: { id: { in: favs.map(f => f.supplierId) } },
    select: { id: true, businessName: true, region: true, district: true, isVerified: true, rating: true, lat: true, lng: true, isOpen: true, openHour: true, closeHour: true },
  });
  res.json({ vendors: sups.map(s => ({ ...s, favorited: true, openNow: openNow(s) })) });
});

// ── POST /api/vendors/:id/favorite ─ toggle favourite ────────────────────────────
router.post('/:id/favorite', requireAuth, async (req: AuthRequest, res) => {
  const existing = await prisma.favorite.findUnique({ where: { userId_supplierId: { userId: req.userId!, supplierId: req.params.id } } });
  if (existing) { await prisma.favorite.delete({ where: { id: existing.id } }); return res.json({ favorited: false }); }
  await prisma.favorite.create({ data: { userId: req.userId!, supplierId: req.params.id } }).catch(() => {});
  res.json({ favorited: true });
});

// ── GET /api/vendors/:id ─ full vendor profile + catalog ─────────────────────────
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  const s = await prisma.supplierProfile.findUnique({
    where:   { id: req.params.id },
    include: { inventory: { where: { isAvailable: true }, include: { product: true } } },
  });
  if (!s) return res.status(404).json({ error: 'Vendor not found' });
  const fav = await prisma.favorite.findUnique({ where: { userId_supplierId: { userId: req.userId!, supplierId: s.id } } });
  res.json({ vendor: { ...s, openNow: openNow(s), favorited: !!fav } });
});

export { router as vendorsRouter };
