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

// Platform admin. Defaults are entered as phone 0752401012 / PIN 123456, but both
// can be overridden via env (ADMIN_PHONE / ADMIN_PIN) so the operator can set a
// private password in Railway without committing it. Phone is stored canonically
// as +255XXXXXXXXX.
function normAdminPhone(v: string): string {
  const c = v.replace(/\s+/g, '');
  if (c.startsWith('+')) return c;
  if (c.startsWith('255')) return '+' + c;
  if (c.startsWith('0')) return '+255' + c.slice(1);
  return '+255' + c;
}
const ADMIN_PHONE = normAdminPhone(process.env.ADMIN_PHONE || '+255752401012');
const ADMIN_PIN   = (process.env.ADMIN_PIN || '123456').replace(/\D/g, '') || '123456';

export async function seedIfEmpty(): Promise<void> {
  if (process.env.JIKO_DISABLE_SEED === '1') return;

  // Always ensure the admin exists AND is reachable: reset the PIN to the known
  // value and CLEAR any login lock / failed-attempt counter on every boot, so a
  // redeploy is a reliable "get me back into the admin panel" lever.
  await prisma.user.upsert({
    where:  { phone: ADMIN_PHONE },
    update: { role: 'ADMIN', isAdmin: true, pinHash: bcrypt.hashSync(ADMIN_PIN, 12), failedLoginCount: 0, lockedUntil: null },
    create: { phone: ADMIN_PHONE, pinHash: bcrypt.hashSync(ADMIN_PIN, 12), role: 'ADMIN', isAdmin: true, name: 'Admin', region: 'Dar es Salaam', kycStatus: 'APPROVED' },
  }).catch((e) => console.error('[seed] admin upsert failed:', e?.message));

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
