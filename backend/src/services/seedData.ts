/**
 * One-time production seed — runs on boot, but ONLY if the catalog is empty.
 * Idempotent: a second boot is a no-op. Disable with JIKO_DISABLE_SEED=1.
 *
 * Mirrors scripts/seed.ts (used for local dev) so the live app has Tanzanian
 * gas brands, EWURA price caps, and demo logins (PIN 1234) on first deploy.
 */
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';

const BRANDS = ['Taifa Gas', 'Oryx', 'Lake Gas', 'O-Gas', 'Manjis', 'Camel Gas'];
const SIZES  = [6, 15, 38, 45];
const pin = () => bcrypt.hashSync('1234', 12);

export async function seedIfEmpty(): Promise<void> {
  if (process.env.JIKO_DISABLE_SEED === '1') return;
  const existing = await prisma.product.count().catch(() => -1);
  if (existing !== 0) return; // already seeded (or DB not ready)

  console.log('[seed] empty catalog → seeding demo data…');

  const products: { id: string; brand: string; sizeKg: number | null; type: string }[] = [];
  for (const brand of BRANDS) {
    for (const sizeKg of SIZES) {
      const refill = await prisma.product.create({ data: { brand, name: `${sizeKg}kg Refill`, type: 'REFILL', sizeKg } });
      products.push({ id: refill.id, brand, sizeKg, type: 'REFILL' });
      if (sizeKg <= 15) {
        const full = await prisma.product.create({ data: { brand, name: `${sizeKg}kg Full Cylinder`, type: 'CYLINDER', sizeKg } });
        products.push({ id: full.id, brand, sizeKg, type: 'CYLINDER' });
      }
    }
  }
  const accessories = await Promise.all(
    [['Regulator'], ['Burner'], ['Pipe'], ['Grill']].map(([name]) =>
      prisma.product.create({ data: { brand: 'Generic', name, type: 'ACCESSORY' } })),
  );

  for (const sizeKg of SIZES) {
    const cap = { 6: 24000, 15: 52000, 38: 120000, 45: 140000 }[sizeKg]!;
    const p = products.find(x => x.sizeKg === sizeKg && x.type === 'REFILL');
    if (p) await prisma.priceCap.create({ data: { region: 'Dar es Salaam', productId: p.id, maxPrice: cap } });
  }

  await prisma.user.create({ data: { phone: '+255700000000', pinHash: pin(), role: 'ADMIN', isAdmin: true, name: 'JIKO Admin', region: 'Dar es Salaam', kycStatus: 'APPROVED' } });

  const priceFor = (sizeKg: number | null, type: string) => {
    if (type === 'ACCESSORY') return 15000;
    const base = { 6: 22000, 15: 48000, 38: 115000, 45: 135000 }[sizeKg ?? 6] ?? 30000;
    return base + (type === 'CYLINDER' ? 45000 : 0);
  };

  const sup1 = await prisma.user.create({
    data: { phone: '+255711111111', pinHash: pin(), role: 'SUPPLIER', name: 'Mwenge Gas Centre', region: 'Dar es Salaam', kycStatus: 'APPROVED',
      supplierProfile: { create: { businessName: 'Mwenge Gas Centre', phone: '+255711111111', region: 'Dar es Salaam', district: 'Kinondoni', lat: -6.7725, lng: 39.2400, isOpen: true, isVerified: true, distributor: 'Oryx Depot Dar' } } },
    include: { supplierProfile: true },
  });
  for (const p of [...products.filter(p => ['Taifa Gas', 'Oryx', 'Lake Gas'].includes(p.brand)), ...accessories.map(a => ({ id: a.id, sizeKg: a.sizeKg as number | null, type: a.type }))] as any[]) {
    await prisma.inventory.create({ data: { supplierId: sup1.supplierProfile!.id, productId: p.id, price: priceFor(p.sizeKg, p.type), stock: 12, isAvailable: true } });
  }

  const sup2 = await prisma.user.create({
    data: { phone: '+255711222333', pinHash: pin(), role: 'SUPPLIER', name: 'Sinza Quick Gas', region: 'Dar es Salaam', kycStatus: 'APPROVED',
      supplierProfile: { create: { businessName: 'Sinza Quick Gas', phone: '+255711222333', region: 'Dar es Salaam', district: 'Ubungo', lat: -6.7840, lng: 39.2120, isOpen: true, isVerified: true, featured: true } } },
    include: { supplierProfile: true },
  });
  for (const p of products.filter(p => p.sizeKg === 6 || p.sizeKg === 15)) {
    await prisma.inventory.create({ data: { supplierId: sup2.supplierProfile!.id, productId: p.id, price: priceFor(p.sizeKg, p.type) - 1500, stock: 8, isAvailable: true } });
  }

  await prisma.user.create({ data: { phone: '+255722222222', pinHash: pin(), role: 'RIDER', name: 'Juma Bajaji', region: 'Dar es Salaam', kycStatus: 'APPROVED', riderProfile: { create: { region: 'Dar es Salaam', vehicleType: 'MOTORBIKE', plateNo: 'MC 123 ABC', isVerified: true } } } });
  await prisma.user.create({ data: { phone: '+255733333333', pinHash: pin(), role: 'HOUSEHOLD', name: 'Asha Mwinyi', region: 'Dar es Salaam', kycStatus: 'APPROVED', addresses: { create: { label: 'Nyumbani', lat: -6.7900, lng: 39.2280, street: 'Mikocheni B', ward: 'Mikocheni', district: 'Kinondoni', region: 'Dar es Salaam', isDefault: true } } } });

  console.log('[seed] done — demo logins ready (PIN 1234)');
}
