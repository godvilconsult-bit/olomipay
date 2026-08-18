/**
 * Public storefront API — the catalog-first front door (§4 of the refactor doc).
 *
 * Deliberately UNAUTHENTICATED. Today discovery is geo-bound and login-gated:
 * you must be signed in and located before you can see that a product exists.
 * A marketplace has to be browsable by anyone — that is what makes product pages
 * shareable and indexable, and organic search is the cheapest acquisition
 * channel a marketplace has.
 *
 * Reads only the phase 1/2 models (Category, Product, Offer, Organization), so
 * it does not depend on the order cutover.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { fromMinor, toMinor } from '../lib/money';
import { priceBands } from '../lib/pricing';

const router = Router();

const MAX_LIMIT = 60;

/** Money is stored in minor units; expose both so clients never guess the scale. */
function money(priceMinor: number, currency: string) {
  return { priceMinor, currency, price: fromMinor(priceMinor, currency) };
}

function offerView(o: any) {
  return {
    id:      o.id,
    ...money(o.priceMinor, o.currency),
    stock:   o.stock,
    moq:     o.moq,
    // Quantity breaks, always an array so a client needs no null handling.
    bands:   priceBands(o.priceMinor, o.tiers).map(b => ({ ...b, price: fromMinor(b.priceMinor, o.currency) })),
    inStock: o.isAvailable && o.stock > 0,
    seller: o.seller && {
      id:         o.seller.id,
      name:       o.seller.name,
      slug:       o.seller.slug,
      kind:       o.seller.kind,
      isVerified: o.seller.isVerified,
      rating:     o.seller.rating,
      ratingCount: o.seller.ratingCount,
      countryCode: o.seller.countryCode,
      lat:        o.seller.lat,
      lng:        o.seller.lng,
    },
  };
}

// ── GET /api/catalog/categories ─ the browse tree ────────────────────────────────
router.get('/categories', async (_req, res) => {
  const cats = await prisma.category.findMany({
    where:   { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  // Product counts per category, so the UI can hide empty branches.
  const counts = await prisma.product.groupBy({ by: ['categoryId'], _count: { _all: true } });
  const countBy = new Map(counts.map(c => [c.categoryId, c._count._all]));

  const nodes = cats.map(c => ({
    id: c.id, key: c.key, name: c.name, parentId: c.parentId,
    unitType: c.unitType, imageUrl: c.imageUrl,
    attributeSchema: c.attributeSchema,
    productCount: countBy.get(c.id) ?? 0,
  }));

  // Nest one level; the tree is shallow today but the shape is future-proof.
  const byId = new Map(nodes.map(n => [n.id, { ...n, children: [] as any[] }]));
  const roots: any[] = [];
  for (const n of byId.values()) {
    if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(n);
    else roots.push(n);
  }

  res.json({ categories: roots, flat: nodes });
});

// ── GET /api/catalog/products ─ browse + search ──────────────────────────────────
const listQuery = z.object({
  q:        z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().optional(),           // Category.key
  brand:    z.string().trim().optional(),           // attributes.brand
  seller:   z.string().trim().optional(),           // Organization.slug
  min:      z.coerce.number().nonnegative().optional(),  // major units
  max:      z.coerce.number().nonnegative().optional(),
  currency: z.string().length(3).default('TZS'),   // scale for min/max
  sort:     z.enum(['price_asc', 'price_desc', 'newest', 'name']).default('price_asc'),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(MAX_LIMIT).default(24),
  // NOT z.coerce.boolean(): that runs JS Boolean(), and Boolean("false") is
  // true, so ?inStock=false would silently keep filtering. Parse the literal.
  inStock:  z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
});

router.get('/products', async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { q, category, brand, seller, min, max, sort, page, limit, inStock, currency } = parsed.data;

  // Offer-level filters decide which products are visible at all: a product with
  // nobody selling it is not merchandise, it is a catalog entry.
  const offerWhere: any = { isAvailable: true };
  if (inStock) offerWhere.stock = { gt: 0 };
  if (seller)  offerWhere.seller = { slug: seller };
  if (min != null || max != null) {
    // Converted through the currency's own exponent, never a hardcoded x100 —
    // the filter must mean the same thing in yen and in dinar. Comparing across
    // currencies still needs FX, which is out of scope; a price filter is
    // per-market for now.
    offerWhere.priceMinor = {};
    if (min != null) offerWhere.priceMinor.gte = toMinor(min, currency);
    if (max != null) offerWhere.priceMinor.lte = toMinor(max, currency);
  }

  const productWhere: any = { offers: { some: offerWhere } };
  if (q)        productWhere.name = { contains: q, mode: 'insensitive' };
  if (category) productWhere.category = { key: category };
  if (brand)    productWhere.attributes = { path: ['brand'], equals: brand };

  // Cheapest offer per product drives both the display price and price sorting.
  // groupBy scans the whole matching set, which is fine at current catalog size;
  // a materialized min-price column is the move when this stops being cheap.
  const matching = await prisma.product.findMany({ where: productWhere, select: { id: true } });
  const ids = matching.map(m => m.id);
  if (ids.length === 0) return res.json({ products: [], total: 0, page, limit, facets: { brands: [] } });

  const grouped = await prisma.offer.groupBy({
    by:    ['productId'],
    where: { ...offerWhere, productId: { in: ids } },
    _min:  { priceMinor: true },
    _count: { _all: true },
  });
  const minPriceBy   = new Map(grouped.map(g => [g.productId, g._min.priceMinor ?? 0]));
  const sellerCountBy = new Map(grouped.map(g => [g.productId, g._count._all]));

  let ordered = [...ids];
  if (sort === 'price_asc')  ordered.sort((a, b) => (minPriceBy.get(a) ?? 0) - (minPriceBy.get(b) ?? 0));
  if (sort === 'price_desc') ordered.sort((a, b) => (minPriceBy.get(b) ?? 0) - (minPriceBy.get(a) ?? 0));

  const total = ordered.length;
  const pageIds = ordered.slice((page - 1) * limit, page * limit);

  const products = await prisma.product.findMany({
    where:   { id: { in: pageIds } },
    include: {
      category: { select: { id: true, key: true, name: true, unitType: true } },
      offers:   { where: offerWhere, orderBy: { priceMinor: 'asc' }, take: 1, include: { seller: true } },
    },
    ...(sort === 'newest' ? { orderBy: { createdAt: 'desc' } } :
        sort === 'name'   ? { orderBy: { name: 'asc' } } : {}),
  });

  // Price sorting was resolved above; restore that order after the fetch.
  const bySortIndex = new Map(pageIds.map((id, i) => [id, i]));
  const rows = (sort === 'price_asc' || sort === 'price_desc')
    ? products.sort((a, b) => (bySortIndex.get(a.id) ?? 0) - (bySortIndex.get(b.id) ?? 0))
    : products;

  // Brand facet over the whole matching set, not just this page.
  const facetRows = await prisma.product.findMany({ where: productWhere, select: { attributes: true } });
  const brandTally = new Map<string, number>();
  for (const r of facetRows) {
    const b = (r.attributes as any)?.brand;
    if (typeof b === 'string') brandTally.set(b, (brandTally.get(b) ?? 0) + 1);
  }

  res.json({
    total, page, limit,
    products: rows.map(p => {
      const best = p.offers[0];
      return {
        id: p.id, name: p.name, imageUrl: p.imageUrl,
        attributes: p.attributes, category: p.category,
        sellerCount: sellerCountBy.get(p.id) ?? 0,
        from: best ? money(best.priceMinor, best.currency) : null,
        bestOffer: best ? offerView(best) : null,
      };
    }),
    facets: {
      brands: [...brandTally.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    },
  });
});

// ── GET /api/catalog/products/:id ─ detail, every seller ─────────────────────────
router.get('/products/:id', async (req, res) => {
  const product = await prisma.product.findUnique({
    where:   { id: req.params.id },
    include: {
      category: true,
      offers:   { where: { isAvailable: true }, orderBy: { priceMinor: 'asc' }, include: { seller: true } },
    },
  });
  if (!product) return res.status(404).json({ error: 'Product not found' });

  /**
   * Units actually sold, from completed orders.
   *
   * Deliberately NOT a product review score: Review records ratings for the
   * SELLER, not the product, so a per-product star rating would be invented.
   * Units sold is real, verifiable from order history, and is the number a B2B
   * buyer is actually reading when they scan "8024 sold".
   *
   * Counts only orders that reached delivery — pending and cancelled ones are
   * not sales, and inflating this would be the same dishonesty as a borrowed
   * guarantee.
   */
  const sold = await prisma.orderItem.aggregate({
    where: { productId: product.id, order: { status: { in: ['DELIVERED', 'COMPLETED'] } } },
    _sum:  { qty: true },
  });

  // The competing-offers list is the point of a marketplace product page: one
  // product, many sellers, cheapest first.
  res.json({
    product: {
      soldCount: sold._sum.qty ?? 0,
      id: product.id, name: product.name, imageUrl: product.imageUrl,
      description: product.description,
      // Always an array so the gallery has one shape; falls back to the single
      // legacy imageUrl for products created before galleries existed.
      images: Array.isArray(product.images) && product.images.length
        ? product.images
        : (product.imageUrl ? [product.imageUrl] : []),
      attributes: product.attributes,
      category: product.category && {
        id: product.category.id, key: product.category.key,
        name: product.category.name, unitType: product.category.unitType,
        attributeSchema: product.category.attributeSchema,
      },
      offers: product.offers.map(offerView),
      from:   product.offers[0] ? money(product.offers[0].priceMinor, product.offers[0].currency) : null,
      sellerCount: product.offers.length,
    },
  });
});

// ── GET /api/catalog/sellers/:slug ─ storefront ──────────────────────────────────
router.get('/sellers/:slug', async (req, res) => {
  const parsed = z.object({
    page:  z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(24),
  }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { page, limit } = parsed.data;

  const org = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
  if (!org || !org.isActive) return res.status(404).json({ error: 'Seller not found' });

  const where = { sellerOrgId: org.id, isAvailable: true };
  const [total, offers] = await Promise.all([
    prisma.offer.count({ where }),
    prisma.offer.findMany({
      where, orderBy: { priceMinor: 'asc' },
      skip: (page - 1) * limit, take: limit,
      include: { product: { include: { category: { select: { key: true, name: true } } } } },
    }),
  ]);

  res.json({
    seller: {
      id: org.id, name: org.name, slug: org.slug, kind: org.kind,
      isVerified: org.isVerified, rating: org.rating, ratingCount: org.ratingCount,
      description: org.description, logoUrl: org.logoUrl,
      countryCode: org.countryCode, currency: org.currency,
      lat: org.lat, lng: org.lng,
      canSell: org.canSell, canCarry: org.canCarry,
      // Public store address + contact. A buyer deciding whether to trust a
      // seller wants to know where they actually are.
      addressLine1: org.addressLine1, addressLine2: org.addressLine2,
      city: org.city, state: org.state, postalCode: org.postalCode,
      contactPhone: org.contactPhone, contactEmail: org.contactEmail,
    },
    total, page, limit,
    listings: offers.map(o => ({
      offer: { id: o.id, ...money(o.priceMinor, o.currency), stock: o.stock, moq: o.moq, inStock: o.stock > 0 },
      product: {
        id: o.product.id, name: o.product.name, imageUrl: o.product.imageUrl,
        attributes: o.product.attributes, category: o.product.category,
      },
    })),
  });
});

// ── GET /api/catalog/sellers ─ directory ─────────────────────────────────────────
router.get('/sellers', async (req, res) => {
  const parsed = z.object({
    kind:    z.enum(['RETAILER', 'WHOLESALER', 'MANUFACTURER', 'CARRIER']).optional(),
    country: z.string().length(2).optional(),
    q:       z.string().trim().min(1).max(120).optional(),
    page:    z.coerce.number().int().min(1).default(1),
    limit:   z.coerce.number().int().min(1).max(MAX_LIMIT).default(24),
  }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { kind, country, q, page, limit } = parsed.data;

  const where: any = { isActive: true, canSell: true };
  if (kind)    where.kind = kind;
  if (country) where.countryCode = country.toUpperCase();
  if (q)       where.name = { contains: q, mode: 'insensitive' };

  const [total, orgs] = await Promise.all([
    prisma.organization.count({ where }),
    prisma.organization.findMany({
      where, orderBy: [{ isVerified: 'desc' }, { rating: 'desc' }, { name: 'asc' }],
      skip: (page - 1) * limit, take: limit,
      include: { _count: { select: { offers: true } } },
    }),
  ]);

  res.json({
    total, page, limit,
    sellers: orgs.map(o => ({
      id: o.id, name: o.name, slug: o.slug, kind: o.kind,
      isVerified: o.isVerified, rating: o.rating, ratingCount: o.ratingCount,
      countryCode: o.countryCode, logoUrl: o.logoUrl,
      listingCount: o._count.offers,
    })),
  });
});

export { router as catalogRouter };
