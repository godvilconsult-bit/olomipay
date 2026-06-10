/**
 * Seed JIKO CONNECT with a runnable demo:
 *   • LPG catalog (Tanzanian brands × sizes) + accessories
 *   • EWURA price caps for Dar es Salaam
 *   • one of each role (admin / supplier / rider / household), PIN 1234
 *
 * Run:  npx tsx scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const pin = () => bcrypt.hashSync('1234', 12);

const BRANDS = ['Taifa Gas', 'Oryx', 'Lake Gas', 'O-Gas', 'Manjis', 'Camel Gas'];
const SIZES  = [6, 15, 38, 45];

async function main() {
  console.log('Seeding JIKO CONNECT…');

  // ── Catalog ──────────────────────────────────────────────────────────────────
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
    [['Regulator', 'Gas regulator'], ['Burner', 'Single burner'], ['Pipe', 'Gas hose 1.5m'], ['Grill', 'Cooker grill']]
      .map(([name]) => prisma.product.create({ data: { brand: 'Generic', name, type: 'ACCESSORY' } })),
  );
  console.log(`  ${products.length} gas products + ${accessories.length} accessories`);

  // ── EWURA price caps (Dar es Salaam) ─────────────────────────────────────────
  for (const sizeKg of SIZES) {
    const cap = { 6: 24000, 15: 52000, 38: 120000, 45: 140000 }[sizeKg]!;
    const p = products.find(x => x.sizeKg === sizeKg && x.type === 'REFILL');
    if (p) await prisma.priceCap.create({ data: { region: 'Dar es Salaam', productId: p.id, maxPrice: cap } });
  }

  // ── Admin ────────────────────────────────────────────────────────────────────
  await prisma.user.create({ data: { phone: '+255700000000', pinHash: pin(), role: 'ADMIN', isAdmin: true, name: 'JIKO Admin', region: 'Dar es Salaam', kycStatus: 'APPROVED' } });

  // ── Supplier (with inventory + location) ─────────────────────────────────────
  const supplierUser = await prisma.user.create({
    data: {
      phone: '+255711111111', pinHash: pin(), role: 'SUPPLIER', name: 'Mwenge Gas Centre', region: 'Dar es Salaam', kycStatus: 'APPROVED',
      supplierProfile: { create: { businessName: 'Mwenge Gas Centre', phone: '+255711111111', region: 'Dar es Salaam', district: 'Kinondoni', lat: -6.7725, lng: 39.2400, isOpen: true, isVerified: true, distributor: 'Oryx Depot Dar' } },
    },
    include: { supplierProfile: true },
  });
  const sp = supplierUser.supplierProfile!;
  const priceFor = (sizeKg: number | null, type: string) => {
    if (type === 'ACCESSORY') return 15000;
    const base = { 6: 22000, 15: 48000, 38: 115000, 45: 135000 }[sizeKg ?? 6] ?? 30000;
    return base + (type === 'CYLINDER' ? 45000 : 0);
  };
  for (const p of [...products.filter(p => p.brand === 'Taifa Gas' || p.brand === 'Oryx' || p.brand === 'Lake Gas'), ...accessories.map(a => ({ id: a.id, brand: a.brand, sizeKg: a.sizeKg, type: a.type }))]) {
    await prisma.inventory.create({ data: { supplierId: sp.id, productId: p.id, price: priceFor(p.sizeKg, p.type), stock: 12, isAvailable: true } });
  }

  // Second supplier (cheaper, slightly farther) so price comparison is meaningful
  const supplier2 = await prisma.user.create({
    data: {
      phone: '+255711222333', pinHash: pin(), role: 'SUPPLIER', name: 'Sinza Quick Gas', region: 'Dar es Salaam', kycStatus: 'APPROVED',
      supplierProfile: { create: { businessName: 'Sinza Quick Gas', phone: '+255711222333', region: 'Dar es Salaam', district: 'Ubungo', lat: -6.7840, lng: 39.2120, isOpen: true, isVerified: true, featured: true } },
    },
    include: { supplierProfile: true },
  });
  for (const p of products.filter(p => p.sizeKg === 6 || p.sizeKg === 15)) {
    await prisma.inventory.create({ data: { supplierId: supplier2.supplierProfile!.id, productId: p.id, price: priceFor(p.sizeKg, p.type) - 1500, stock: 8, isAvailable: true } });
  }

  // ── Rider ────────────────────────────────────────────────────────────────────
  await prisma.user.create({ data: { phone: '+255722222222', pinHash: pin(), role: 'RIDER', name: 'Juma Bajaji', region: 'Dar es Salaam', kycStatus: 'APPROVED', riderProfile: { create: { region: 'Dar es Salaam', vehicleType: 'MOTORBIKE', plateNo: 'MC 123 ABC', isVerified: true } } } });

  // ── Household (with default address) ─────────────────────────────────────────
  await prisma.user.create({ data: { phone: '+255733333333', pinHash: pin(), role: 'HOUSEHOLD', name: 'Asha Mwinyi', region: 'Dar es Salaam', kycStatus: 'APPROVED', addresses: { create: { label: 'Nyumbani', lat: -6.7900, lng: 39.2280, street: 'Mikocheni B', ward: 'Mikocheni', district: 'Kinondoni', region: 'Dar es Salaam', isDefault: true } } } });

  console.log('Done. Demo logins (PIN 1234):');
  console.log('  Admin     +255700000000');
  console.log('  Supplier  +255711111111');
  console.log('  Rider     +255722222222');
  console.log('  Household +255733333333');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
