/**
 * Phase 2 backfill — populate the universal-marketplace models from the live
 * gas data. See docs/refactor/UNIVERSAL-MARKETPLACE.md §10.
 *
 * Run it via `npm run backfill` (scripts/backfill-marketplace.ts is a thin CLI
 * wrapper around this).
 *
 * IDEMPOTENT: every step skips rows it has already converted, so it is safe to
 * re-run after a partial failure or against a database that is already migrated.
 * Nothing reads these models yet, so running it changes no behaviour.
 *
 * REVERSIBLE: it only writes new tables plus the nullable bridge columns
 * (Product.categoryId/attributes, SupplierProfile.orgId, DistributorProfile.orgId,
 * User.primaryOrgId). No legacy column is modified or dropped.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { toMinor } from '../lib/money';

const DEFAULT_COUNTRY  = 'TZ';
const DEFAULT_CURRENCY = 'TZS';
const DEFAULT_LOCALE   = 'en';
const DEFAULT_TZ       = 'Africa/Dar_es_Salaam';

/** Today's ProductType enum, expressed as categories with an attribute schema. */
const GAS_CATEGORIES: {
  key: string; name: string; unitType: string; sortOrder: number; attributeSchema: Prisma.InputJsonObject;
}[] = [
  {
    key: 'lpg_refill', name: 'LPG Gas Refill', unitType: 'piece', sortOrder: 1,
    attributeSchema: {
      type: 'object',
      required: ['brand', 'sizeKg'],
      properties: {
        brand:  { type: 'string', title: 'Brand' },
        sizeKg: { type: 'number', title: 'Cylinder size (kg)', enum: [6, 15, 38, 45] },
      },
    },
  },
  {
    key: 'lpg_cylinder', name: 'LPG Cylinder (new)', unitType: 'piece', sortOrder: 2,
    attributeSchema: {
      type: 'object',
      required: ['brand', 'sizeKg'],
      properties: {
        brand:  { type: 'string', title: 'Brand' },
        sizeKg: { type: 'number', title: 'Cylinder size (kg)', enum: [6, 15, 38, 45] },
      },
    },
  },
  {
    key: 'lpg_accessory', name: 'Gas Accessories', unitType: 'piece', sortOrder: 3,
    attributeSchema: {
      type: 'object',
      required: ['brand'],
      properties: { brand: { type: 'string', title: 'Brand' } },
    },
  },
];

const CATEGORY_FOR_TYPE: Record<string, string> = {
  REFILL:    'lpg_refill',
  CYLINDER:  'lpg_cylinder',
  ACCESSORY: 'lpg_accessory',
};

export interface BackfillStats {
  categories: number;
  products: number;
  retailerOrgs: number;
  wholesalerOrgs: number;
  carrierOrgs: number;
  individualOrgs: number;
  memberships: number;
  offersFromInventory: number;
  offersFromDistributorStock: number;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'org';
}

/** Slugs are unique platform-wide; two shops may legitimately share a name. */
async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 200; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await prisma.organization.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  return `${root}-${Date.now()}`;
}

export async function backfillMarketplace(
  opts: { dryRun?: boolean; log?: (m: string) => void } = {},
): Promise<BackfillStats> {
  const log = opts.log ?? console.log;
  const stats: BackfillStats = {
    categories: 0, products: 0, retailerOrgs: 0, wholesalerOrgs: 0, carrierOrgs: 0,
    individualOrgs: 0, memberships: 0, offersFromInventory: 0, offersFromDistributorStock: 0,
  };

  if (opts.dryRun) {
    log('[backfill] DRY RUN — counting only, nothing will be written');
    stats.categories     = GAS_CATEGORIES.length;
    stats.products       = await prisma.product.count({ where: { categoryId: null } });
    stats.retailerOrgs   = await prisma.supplierProfile.count({ where: { orgId: null } });
    stats.wholesalerOrgs = await prisma.distributorProfile.count({ where: { orgId: null } });
    stats.individualOrgs = await prisma.user.count({ where: { primaryOrgId: null } });
    return stats;
  }

  // ── 1. Categories ────────────────────────────────────────────────────────────
  const categoryIdByKey = new Map<string, string>();
  for (const c of GAS_CATEGORIES) {
    const row = await prisma.category.upsert({
      where:  { key: c.key },
      update: { name: c.name, unitType: c.unitType, attributeSchema: c.attributeSchema, sortOrder: c.sortOrder },
      create: { key: c.key, name: c.name, unitType: c.unitType, attributeSchema: c.attributeSchema, sortOrder: c.sortOrder },
    });
    categoryIdByKey.set(c.key, row.id);
    stats.categories++;
  }
  log(`[backfill] categories ready: ${stats.categories}`);

  // ── 2. Products → category + attributes ──────────────────────────────────────
  const products = await prisma.product.findMany({ where: { categoryId: null } });
  for (const p of products) {
    const categoryId = categoryIdByKey.get(CATEGORY_FOR_TYPE[p.type] ?? 'lpg_accessory')!;
    // sizeKg is omitted rather than null for accessories, so the attribute set
    // matches the category's schema exactly.
    const attributes: Prisma.InputJsonObject =
      p.sizeKg != null ? { brand: p.brand, sizeKg: p.sizeKg } : { brand: p.brand };

    await prisma.product.update({ where: { id: p.id }, data: { categoryId, attributes } });
    stats.products++;
  }
  log(`[backfill] products mapped: ${stats.products}`);

  // ── 3. Shops → RETAILER orgs ─────────────────────────────────────────────────
  const shops = await prisma.supplierProfile.findMany({ where: { orgId: null } });
  for (const s of shops) {
    const slug = await uniqueSlug(s.businessName);
    const org = await prisma.organization.create({
      data: {
        name: s.businessName, slug, kind: 'RETAILER',
        canBuy: true, canSell: true, canCarry: false,
        countryCode: DEFAULT_COUNTRY, currency: DEFAULT_CURRENCY, locale: DEFAULT_LOCALE, timezone: DEFAULT_TZ,
        isVerified: s.isVerified, rating: s.rating, ratingCount: s.ratingCount,
        logoUrl: s.logoUrl, description: s.description, lat: s.lat, lng: s.lng,
      },
    });
    await prisma.supplierProfile.update({ where: { id: s.id }, data: { orgId: org.id } });
    await linkOwner(s.userId, org.id, stats);
    stats.retailerOrgs++;
  }
  log(`[backfill] retailer orgs: ${stats.retailerOrgs}`);

  // ── 4. Depots → WHOLESALER orgs ──────────────────────────────────────────────
  const depots = await prisma.distributorProfile.findMany({ where: { orgId: null } });
  for (const d of depots) {
    const slug = await uniqueSlug(d.businessName);
    const org = await prisma.organization.create({
      data: {
        name: d.businessName, slug, kind: 'WHOLESALER',
        canBuy: true, canSell: true, canCarry: false,
        countryCode: DEFAULT_COUNTRY, currency: DEFAULT_CURRENCY, locale: DEFAULT_LOCALE, timezone: DEFAULT_TZ,
        isVerified: d.isVerified, lat: d.lat, lng: d.lng,
      },
    });
    await prisma.distributorProfile.update({ where: { id: d.id }, data: { orgId: org.id } });
    await linkOwner(d.userId, org.id, stats);
    stats.wholesalerOrgs++;
  }
  log(`[backfill] wholesaler orgs: ${stats.wholesalerOrgs}`);

  // ── 5. Everyone else → CARRIER (riders) or INDIVIDUAL org ────────────────────
  const remaining = await prisma.user.findMany({
    where:  { primaryOrgId: null },
    select: { id: true, name: true, phone: true, role: true },
  });
  for (const u of remaining) {
    const isRider = u.role === 'RIDER';
    const label   = u.name?.trim() || u.phone;
    const slug    = await uniqueSlug(label);
    const org = await prisma.organization.create({
      data: {
        name: label, slug,
        kind:     isRider ? 'CARRIER' : 'INDIVIDUAL',
        canBuy:   true,
        canSell:  false,
        canCarry: isRider,
        countryCode: DEFAULT_COUNTRY, currency: DEFAULT_CURRENCY, locale: DEFAULT_LOCALE, timezone: DEFAULT_TZ,
      },
    });
    await linkOwner(u.id, org.id, stats);
    if (isRider) stats.carrierOrgs++; else stats.individualOrgs++;
  }
  log(`[backfill] carrier orgs: ${stats.carrierOrgs}, individual orgs: ${stats.individualOrgs}`);

  // ── 6. Inventory → Offer (retail) ────────────────────────────────────────────
  const inventory = await prisma.inventory.findMany({ include: { supplier: { select: { orgId: true } } } });
  for (const inv of inventory) {
    const sellerOrgId = inv.supplier.orgId;
    if (!sellerOrgId) continue; // shop had no org — shouldn't happen after step 3
    await prisma.offer.upsert({
      where:  { sellerOrgId_productId: { sellerOrgId, productId: inv.productId } },
      update: { priceMinor: toMinor(inv.price, DEFAULT_CURRENCY), stock: inv.stock, isAvailable: inv.isAvailable },
      create: {
        sellerOrgId, productId: inv.productId,
        priceMinor: toMinor(inv.price, DEFAULT_CURRENCY), currency: DEFAULT_CURRENCY,
        stock: inv.stock, moq: 1, isAvailable: inv.isAvailable,
      },
    });
    stats.offersFromInventory++;
  }
  log(`[backfill] offers from inventory: ${stats.offersFromInventory}`);

  // ── 7. DistributorStock → Offer (wholesale) ──────────────────────────────────
  // Wholesale carries a minimum order quantity; retail does not. This is the
  // only structural difference between the two, which is why one model serves both.
  const WHOLESALE_MOQ = Number(process.env.JIKO_WHOLESALE_MOQ ?? 10);
  const depotStock = await prisma.distributorStock.findMany({ include: { distributor: { select: { orgId: true } } } });
  for (const ds of depotStock) {
    const sellerOrgId = ds.distributor.orgId;
    if (!sellerOrgId) continue;
    await prisma.offer.upsert({
      where:  { sellerOrgId_productId: { sellerOrgId, productId: ds.productId } },
      update: { priceMinor: toMinor(ds.price, DEFAULT_CURRENCY), stock: ds.stock, isAvailable: ds.isAvailable },
      create: {
        sellerOrgId, productId: ds.productId,
        priceMinor: toMinor(ds.price, DEFAULT_CURRENCY), currency: DEFAULT_CURRENCY,
        stock: ds.stock, moq: WHOLESALE_MOQ, isAvailable: ds.isAvailable,
      },
    });
    stats.offersFromDistributorStock++;
  }
  log(`[backfill] offers from distributor stock: ${stats.offersFromDistributorStock}`);

  return stats;
}

/** Make the user an OWNER of the org and point their primaryOrgId at it. */
async function linkOwner(userId: string, orgId: string, stats: BackfillStats): Promise<void> {
  const existing = await prisma.membership.findUnique({ where: { userId_orgId: { userId, orgId } } });
  if (!existing) {
    await prisma.membership.create({ data: { userId, orgId, role: 'OWNER' } });
    stats.memberships++;
  }
  // A supplier who is also a rider keeps whichever org was linked first.
  await prisma.user.updateMany({ where: { id: userId, primaryOrgId: null }, data: { primaryOrgId: orgId } });
}
