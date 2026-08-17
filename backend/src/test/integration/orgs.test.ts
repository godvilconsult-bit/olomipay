/**
 * Every acting user must have an Organization.
 *
 * This is the regression test for "sellers can't list their products": the
 * phase 2 backfill created orgs for existing users, but registration never did,
 * so every account made afterwards had primaryOrgId null and was refused by
 * every org-scoped feature.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../lib/prisma';
import { ensureOrgForUser, capabilitiesFor } from '../../services/orgs';
import { actingOrgId } from '../../services/freight';

let seq = 0;
const phone = () => `+2552${String(Date.now()).slice(-6)}${String(seq++).padStart(3, '0')}`;

async function rawUser(role: any, name = 'No Org User', businessName?: string) {
  const user = await prisma.user.create({ data: { phone: phone(), pinHash: 'x', role, name } });
  if (businessName && (role === 'SUPPLIER')) {
    await prisma.supplierProfile.create({
      data: { userId: user.id, businessName, phone: user.phone, region: 'Dar es Salaam', lat: -6.8, lng: 39.28 },
    });
  }
  return user;
}

beforeAll(async () => { await prisma.$connect(); });

describe('capabilitiesFor', () => {
  it('lets shops and wholesalers sell, riders carry, and buyers only buy', () => {
    expect(capabilitiesFor('SUPPLIER' as any)).toMatchObject({ kind: 'RETAILER', canSell: true });
    expect(capabilitiesFor('DISTRIBUTOR' as any)).toMatchObject({ kind: 'WHOLESALER', canSell: true });
    expect(capabilitiesFor('RIDER' as any)).toMatchObject({ kind: 'CARRIER', canCarry: true, canSell: false });
    expect(capabilitiesFor('HOUSEHOLD' as any)).toMatchObject({ kind: 'INDIVIDUAL', canSell: false });
  });
});

describe('ensureOrgForUser', () => {
  it('creates a selling org for a supplier who has none', async () => {
    const user = await rawUser('SUPPLIER', 'Shop Owner', 'Kariakoo Hardware');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).primaryOrgId).toBeNull();

    const orgId = await ensureOrgForUser(user.id);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

    expect(org.kind).toBe('RETAILER');
    expect(org.canSell).toBe(true);
    // The business name is the seller's public identity, not their personal name.
    expect(org.name).toBe('Kariakoo Hardware');

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.primaryOrgId).toBe(orgId);

    const membership = await prisma.membership.findUnique({ where: { userId_orgId: { userId: user.id, orgId } } });
    expect(membership?.role).toBe('OWNER');
  });

  it('points the legacy SupplierProfile at the same org, so the storefront finds it', async () => {
    const user = await rawUser('SUPPLIER', 'Linked Owner', 'Linked Shop');
    const orgId = await ensureOrgForUser(user.id);

    const profile = await prisma.supplierProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(profile.orgId).toBe(orgId);
  });

  it('is idempotent — a second call returns the same org', async () => {
    const user = await rawUser('HOUSEHOLD', 'Repeat Buyer');
    const first  = await ensureOrgForUser(user.id);
    const second = await ensureOrgForUser(user.id);
    expect(second).toBe(first);
    expect(await prisma.organization.count({ where: { id: first } })).toBe(1);
  });

  it('grants selling rights to an org that predates the role, without revoking extras', async () => {
    // A user who signed up as a buyer and later became a supplier would
    // otherwise be stuck with canSell false and no way to fix it in the UI.
    const user = await rawUser('HOUSEHOLD', 'Upgrader');
    const orgId = await ensureOrgForUser(user.id);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })).canSell).toBe(false);

    // Hand-grant carrying, then switch their role to a selling one.
    await prisma.organization.update({ where: { id: orgId }, data: { canCarry: true } });
    await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPPLIER' } });

    await ensureOrgForUser(user.id);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.canSell).toBe(true);    // granted
    expect(org.canCarry).toBe(true);   // not revoked
  });

  it('recovers when primaryOrgId points at a deleted org', async () => {
    const user = await rawUser('SUPPLIER', 'Orphaned', 'Orphan Shop');
    const first = await ensureOrgForUser(user.id);
    await prisma.organization.delete({ where: { id: first } });

    const second = await ensureOrgForUser(user.id);
    expect(second).not.toBe(first);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).primaryOrgId).toBe(second);
  });

  it('gives distinct slugs to shops with the same name', async () => {
    const a = await rawUser('SUPPLIER', 'A', 'Same Name Shop');
    const b = await rawUser('SUPPLIER', 'B', 'Same Name Shop');
    const orgA = await prisma.organization.findUniqueOrThrow({ where: { id: await ensureOrgForUser(a.id) } });
    const orgB = await prisma.organization.findUniqueOrThrow({ where: { id: await ensureOrgForUser(b.id) } });
    expect(orgA.slug).not.toBe(orgB.slug);
  });
});

describe('actingOrgId', () => {
  it('no longer refuses a user without an org — it creates one', async () => {
    const user = await rawUser('SUPPLIER', 'Late Signup', 'Late Shop');

    // Previously this threw 409 "not linked to an organization yet", which is
    // exactly what blocked sellers from listing.
    const orgId = await actingOrgId(user.id);

    expect(orgId).toBeTruthy();
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.canSell).toBe(true);
  });
});
