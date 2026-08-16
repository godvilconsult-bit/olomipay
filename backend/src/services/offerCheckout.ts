/**
 * Checkout from storefront Offers.
 *
 * This is the bridge that makes the new catalog actually buyable without doing
 * the phase 4 order cutover first. An Offer is resolved back to the legacy
 * (SupplierProfile, Inventory) pair and handed to the existing, well-tested
 * placeOrder — so every downstream behaviour (money split, stock decrement,
 * supplier alert, rider dispatch, payment) is unchanged and unduplicated.
 *
 * The resolution is safe because phase 2 linked the two worlds:
 *   Offer.sellerOrgId -> Organization.supplierProfile -> Inventory(supplier, product)
 *
 * When phase 4 lands, this file collapses into the order code itself and the
 * legacy lookup disappears. Until then it is a thin, reversible adapter.
 */
import { prisma } from '../lib/prisma';
import { placeOrder } from './placeOrder';

export interface OfferLine { offerId: string; qty: number }

function fail(message: string, http: number): never {
  throw Object.assign(new Error(message), { http });
}

export async function placeOrderFromOffers(
  userId: string,
  lines: OfferLine[],
  opts: { addressId?: string; note?: string } = {},
) {
  if (lines.length === 0) fail('No items to order', 400);

  const offers = await prisma.offer.findMany({
    where:   { id: { in: lines.map(l => l.offerId) } },
    include: {
      product: { select: { id: true, name: true } },
      seller:  { include: { supplierProfile: { select: { id: true, isOpen: true, businessName: true } } } },
    },
  });
  if (offers.length !== lines.length) fail('Some items are no longer listed', 404);

  // One order, one seller — same constraint the current Order model has. Rather
  // than silently splitting a mixed basket into several orders (which would
  // surprise the buyer on fees and delivery), say so plainly.
  const sellerIds = [...new Set(offers.map(o => o.sellerOrgId))];
  if (sellerIds.length > 1) {
    fail('All items must come from the same seller. Order from each seller separately.', 400);
  }

  const seller = offers[0].seller;
  const shop   = seller.supplierProfile;
  if (!shop) {
    // A wholesaler or manufacturer with no legacy shop profile cannot be
    // fulfilled by the current single-tier order flow. Phase 4 removes this.
    fail(`${seller.name} is not set up to take orders yet`, 409);
  }
  if (!shop.isOpen) fail(`${seller.name} is currently closed`, 409);

  const qtyByOffer = new Map(lines.map(l => [l.offerId, l.qty]));

  // Minimum order quantity is the one thing that structurally distinguishes a
  // wholesale offer from a retail one, so it has to be enforced here or the
  // wholesale tier is decorative.
  for (const o of offers) {
    const qty = qtyByOffer.get(o.id)!;
    if (qty < o.moq) fail(`${o.product.name}: minimum order is ${o.moq}`, 400);
    if (!o.isAvailable || o.stock < qty) fail(`${o.product.name} is out of stock`, 409);
  }

  // Map each offer back to the vendor's inventory row for the same product.
  const inventories = await prisma.inventory.findMany({
    where: { supplierId: shop.id, productId: { in: offers.map(o => o.productId) } },
  });
  const invByProduct = new Map(inventories.map(i => [i.productId, i]));

  const items = offers.map(o => {
    const inv = invByProduct.get(o.productId);
    if (!inv) fail(`${o.product.name} is not currently stocked by ${seller.name}`, 409);
    return { inventoryId: inv.id, qty: qtyByOffer.get(o.id)! };
  });

  // Deliver to the requested address, else the buyer's default.
  let addressId = opts.addressId;
  if (!addressId) {
    const def = await prisma.address.findFirst({ where: { userId, isDefault: true } })
             ?? await prisma.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    if (!def) fail('Add a delivery address first', 400);
    addressId = def.id;
  }

  return placeOrder(userId, shop.id, addressId, items, opts.note);
}
