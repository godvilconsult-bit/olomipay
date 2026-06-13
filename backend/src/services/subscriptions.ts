/**
 * Auto-refill scheduler. Periodically places recurring gas orders for households
 * who opted into a subscription, re-resolving each item to the vendor's CURRENT
 * in-stock inventory (prices/stock drift between cycles). Runs in-process on an
 * interval — fine for a single Railway instance.
 */
import { prisma } from '../lib/prisma';
import { placeOrder } from '../routes/orders';
import { notify } from './notify';

const DAY = 864e5;

export async function runDueSubscriptions(): Promise<number> {
  const due = await prisma.subscription.findMany({
    where: { isActive: true, nextRunAt: { lte: new Date() } },
    take: 100,
  });
  let placed = 0;

  for (const sub of due) {
    const next = new Date(Date.now() + sub.intervalDays * DAY);
    try {
      const items = Array.isArray(sub.items) ? (sub.items as any[]) : [];
      const resolved: { inventoryId: string; qty: number }[] = [];
      for (const it of items) {
        const inv = await prisma.inventory.findFirst({
          where: { supplierId: sub.supplierId, productId: it.productId, isAvailable: true, stock: { gte: it.qty } },
        });
        if (inv) resolved.push({ inventoryId: inv.id, qty: it.qty });
      }

      if (resolved.length === 0) {
        await notify(sub.householdId, { title: 'Auto-refill skipped', body: 'Your usual vendor is out of stock right now — we will retry next cycle.', type: 'order' }).catch(() => {});
        await prisma.subscription.update({ where: { id: sub.id }, data: { nextRunAt: next, lastRunAt: new Date() } });
        continue;
      }

      const { order } = await placeOrder(sub.householdId, sub.supplierId, sub.addressId, resolved, 'Auto-refill 🔁');
      await prisma.subscription.update({ where: { id: sub.id }, data: { nextRunAt: next, lastRunAt: new Date(), lastOrderId: order.id } });
      await notify(sub.householdId, { title: 'Auto-refill placed 🔁', body: `Your scheduled gas order ${order.orderNo} is in. Complete payment to dispatch it.`, type: 'order', data: { orderId: order.id } }).catch(() => {});
      placed++;
    } catch {
      // Don't let one bad subscription stall the rest; try again next cycle.
      await prisma.subscription.update({ where: { id: sub.id }, data: { nextRunAt: next, lastRunAt: new Date() } }).catch(() => {});
    }
  }
  return placed;
}

export function startSubscriptionScheduler(): void {
  const everyMin = Number(process.env.JIKO_SUB_INTERVAL_MIN ?? 15);
  setInterval(() => { runDueSubscriptions().catch(() => {}); }, everyMin * 60_000);
  console.log(`[subscriptions] scheduler every ${everyMin}m`);
}
