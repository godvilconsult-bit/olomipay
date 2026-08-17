/**
 * Every acting user needs an Organization.
 *
 * The phase 2 backfill created one per existing user, but it is a migration —
 * it runs once. Registration never created one, so every account made after the
 * backfill had no org, and every org-scoped feature refused it: listing a
 * product, starting a conversation, posting a load. The symptom was "sellers
 * can't list their products"; the cause was a missing row.
 *
 * This is used from two places on purpose:
 *   - registration, which is where an org should be created; and
 *   - actingOrgId(), which heals accounts that already exist without one, so
 *     nobody has to re-run a migration to unbreak them.
 */
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';

const DEFAULTS = {
  countryCode: 'TZ',
  currency:    'TZS',
  locale:      'en',
  timezone:    'Africa/Dar_es_Salaam',
};

/** What a role is allowed to do as an organization. */
export function capabilitiesFor(role: Role) {
  switch (role) {
    case 'SUPPLIER':    return { kind: 'RETAILER'   as const, canBuy: true, canSell: true,  canCarry: false };
    case 'DISTRIBUTOR': return { kind: 'WHOLESALER' as const, canBuy: true, canSell: true,  canCarry: false };
    case 'RIDER':       return { kind: 'CARRIER'    as const, canBuy: true, canSell: false, canCarry: true  };
    // A brand advertises and may sell direct, so it gets selling rights.
    case 'BRAND':       return { kind: 'MANUFACTURER' as const, canBuy: true, canSell: true, canCarry: false };
    default:            return { kind: 'INDIVIDUAL' as const, canBuy: true, canSell: false, canCarry: false };
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'org';
}

/** Slugs are unique platform-wide; two shops may share a name. */
async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 200; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await prisma.organization.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/**
 * The org this user acts as, creating it if absent.
 *
 * Also reconciles capabilities: a user who signed up as a buyer and later became
 * a seller (or whose org predates this logic) would otherwise be stuck with
 * canSell false and no way to fix it from the UI.
 */
export async function ensureOrgForUser(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      id: true, name: true, phone: true, role: true, primaryOrgId: true,
      supplierProfile:    { select: { businessName: true, orgId: true, lat: true, lng: true } },
      distributorProfile: { select: { businessName: true, orgId: true, lat: true, lng: true } },
    },
  });
  if (!user) throw Object.assign(new Error('User not found'), { http: 404 });

  const caps = capabilitiesFor(user.role);

  if (user.primaryOrgId) {
    const org = await prisma.organization.findUnique({
      where:  { id: user.primaryOrgId },
      select: { id: true, canSell: true, canCarry: true },
    });
    if (org) {
      // Grant, never revoke: a role that implies selling should be able to sell,
      // but an org deliberately given extra rights keeps them.
      const grant: { canSell?: boolean; canCarry?: boolean } = {};
      if (caps.canSell  && !org.canSell)  grant.canSell  = true;
      if (caps.canCarry && !org.canCarry) grant.canCarry = true;
      if (Object.keys(grant).length) {
        await prisma.organization.update({ where: { id: org.id }, data: grant });
      }
      return org.id;
    }
    // primaryOrgId pointed at a deleted org — fall through and make a new one.
  }

  // A business name is the seller's public identity; fall back to their own name.
  const label =
    user.supplierProfile?.businessName?.trim() ||
    user.distributorProfile?.businessName?.trim() ||
    user.name?.trim() ||
    user.phone;

  const geo = user.supplierProfile ?? user.distributorProfile;

  const org = await prisma.organization.create({
    data: {
      name: label,
      slug: await uniqueSlug(label),
      kind: caps.kind,
      canBuy: caps.canBuy, canSell: caps.canSell, canCarry: caps.canCarry,
      ...DEFAULTS,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
    },
  });

  await prisma.membership.upsert({
    where:  { userId_orgId: { userId, orgId: org.id } },
    update: {},
    create: { userId, orgId: org.id, role: 'OWNER' },
  });
  await prisma.user.update({ where: { id: userId }, data: { primaryOrgId: org.id } });

  // Keep the legacy profile pointing at the same org so the storefront, which
  // resolves sellers through SupplierProfile.orgId, finds it.
  if (user.supplierProfile && !user.supplierProfile.orgId) {
    await prisma.supplierProfile.update({ where: { userId }, data: { orgId: org.id } });
  }
  if (user.distributorProfile && !user.distributorProfile.orgId) {
    await prisma.distributorProfile.update({ where: { userId }, data: { orgId: org.id } });
  }

  return org.id;
}
