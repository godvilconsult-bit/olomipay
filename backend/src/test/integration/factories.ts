/** Minimal row builders for the integration suite. */
import { prisma } from '../../lib/prisma';
import type { ProductType, SupplierTier } from '@prisma/client';

let seq = 0;
/** Unique per row — `phone` is @unique and the suite shares one database. */
const uniquePhone = () => `+2557${String(Date.now()).slice(-6)}${String(seq++).padStart(3, '0')}`;

export async function makeHousehold() {
  return prisma.user.create({
    data: { phone: uniquePhone(), pinHash: 'test-not-a-real-hash', role: 'HOUSEHOLD', name: 'Test Household' },
  });
}

/** A supplier user plus its profile. Location defaults to central Dar es Salaam. */
export async function makeSupplier(opts: { tier?: SupplierTier; isOpen?: boolean; lat?: number; lng?: number } = {}) {
  const user = await prisma.user.create({
    data: { phone: uniquePhone(), pinHash: 'test-not-a-real-hash', role: 'SUPPLIER', name: 'Test Supplier' },
  });
  const profile = await prisma.supplierProfile.create({
    data: {
      userId:       user.id,
      businessName: 'Test Gas Shop',
      phone:        user.phone,
      region:       'Dar es Salaam',
      lat:          opts.lat   ?? -6.8,
      lng:          opts.lng   ?? 39.28,
      isOpen:       opts.isOpen ?? true,
      tier:         opts.tier   ?? 'FREE',
    },
  });
  return { user, profile };
}

export async function makeAddress(userId: string, opts: { lat?: number; lng?: number } = {}) {
  return prisma.address.create({
    data: {
      userId,
      label:     'Home',
      lat:       opts.lat ?? -6.81,
      lng:       opts.lng ?? 39.29,
      isDefault: true,
    },
  });
}

export async function makeProduct(opts: { type?: ProductType; brand?: string; name?: string; sizeKg?: number | null } = {}) {
  return prisma.product.create({
    data: {
      brand:  opts.brand ?? 'Oryx',
      name:   opts.name  ?? '15kg Refill',
      type:   opts.type  ?? 'REFILL',
      sizeKg: opts.sizeKg === undefined ? 15 : opts.sizeKg,
    },
  });
}

export async function makeInventory(supplierId: string, productId: string, opts: { price?: number; stock?: number } = {}) {
  return prisma.inventory.create({
    data: {
      supplierId,
      productId,
      price: opts.price ?? 45_000,
      stock: opts.stock ?? 10,
    },
  });
}

/** Household + supplier + address + one in-stock refill — the common setup. */
export async function makeOrderableWorld(opts: { tier?: SupplierTier; price?: number; stock?: number } = {}) {
  const household = await makeHousehold();
  const supplier  = await makeSupplier({ tier: opts.tier });
  const address   = await makeAddress(household.id);
  const product   = await makeProduct();
  const inventory = await makeInventory(supplier.profile.id, product.id, { price: opts.price, stock: opts.stock });
  return { household, supplier, address, product, inventory };
}
