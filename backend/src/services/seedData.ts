/**
 * Reference seed — runs on boot, ONLY if the catalog is empty. Idempotent.
 *
 * Seeds REAL reference data only: the Tanzanian LPG brand/size catalog, EWURA
 * price caps, and the platform admin account. NO demo households/suppliers/
 * riders — those are real sign-ups. Disable with JIKO_DISABLE_SEED=1.
 */
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';

const BRANDS = ['Taifa Gas', 'Oryx', 'Lake Gas', 'O-Gas', 'Manjis', 'Camel Gas'];
const SIZES  = [6, 15, 38, 45];

// Platform admin — phone stored canonically as +255, entered as 0752401012.
const ADMIN_PHONE = '+255752401012';
const ADMIN_PIN   = '123456';

export async function seedIfEmpty(): Promise<void> {
  if (process.env.JIKO_DISABLE_SEED === '1') return;

  // Always ensure the admin exists (cheap upsert), even if catalog already seeded.
  await prisma.user.upsert({
    where:  { phone: ADMIN_PHONE },
    update: { role: 'ADMIN', isAdmin: true, pinHash: bcrypt.hashSync(ADMIN_PIN, 12) },
    create: { phone: ADMIN_PHONE, pinHash: bcrypt.hashSync(ADMIN_PIN, 12), role: 'ADMIN', isAdmin: true, name: 'Admin', region: 'Dar es Salaam', kycStatus: 'APPROVED' },
  }).catch(() => {});

  const existing = await prisma.product.count().catch(() => -1);
  if (existing !== 0) return; // catalog already seeded (or DB not ready)

  console.log('[seed] empty catalog → seeding reference data…');

  const refills: { id: string; sizeKg: number }[] = [];
  for (const brand of BRANDS) {
    for (const sizeKg of SIZES) {
      const r = await prisma.product.create({ data: { brand, name: `${sizeKg}kg Refill`, type: 'REFILL', sizeKg } });
      refills.push({ id: r.id, sizeKg });
      if (sizeKg <= 15) await prisma.product.create({ data: { brand, name: `${sizeKg}kg Full Cylinder`, type: 'CYLINDER', sizeKg } });
    }
  }
  for (const name of ['Regulator', 'Burner', 'Pipe', 'Grill']) {
    await prisma.product.create({ data: { brand: 'Generic', name, type: 'ACCESSORY' } });
  }

  for (const sizeKg of SIZES) {
    const cap = { 6: 24000, 15: 52000, 38: 120000, 45: 140000 }[sizeKg]!;
    const p = refills.find(x => x.sizeKg === sizeKg);
    if (p) await prisma.priceCap.create({ data: { region: 'Dar es Salaam', productId: p.id, maxPrice: cap } });
  }

  console.log('[seed] reference data ready (catalog + EWURA caps + admin)');
}
