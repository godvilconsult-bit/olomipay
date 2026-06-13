/**
 * Growth rewards (Tier 3): loyalty points earned per completed order, and a
 * two-sided referral bonus paid to both parties on the referee's first
 * completed order. Credits land in the wallet built in Tier 1.
 */
import { prisma } from '../lib/prisma';
import { postTxn } from './wallet';
import { notify } from './notify';

const REFERRAL_BONUS = Number(process.env.JIKO_REFERRAL_BONUS ?? 1000);  // TZS to each side
const EARN_PER       = Number(process.env.JIKO_LOYALTY_EARN_PER ?? 1000); // TZS spent per 1 point

/** Generate a short, unique, shareable referral code. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (u?.referralCode) return u.referralCode;
  for (let i = 0; i < 6; i++) {
    const code = 'JK' + Math.random().toString(36).slice(2, 7).toUpperCase();
    try { await prisma.user.update({ where: { id: userId }, data: { referralCode: code } }); return code; }
    catch { /* unique collision — retry */ }
  }
  // Fallback: derive from id (always unique)
  const code = 'JK' + userId.slice(-6).toUpperCase();
  await prisma.user.update({ where: { id: userId }, data: { referralCode: code } }).catch(() => {});
  return code;
}

export async function onOrderCompleted(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { householdId: true, total: true } });
    if (!order) return;

    // 1) Loyalty points to the household.
    const points = Math.floor(order.total / EARN_PER);
    if (points > 0) await prisma.user.update({ where: { id: order.householdId }, data: { loyaltyPoints: { increment: points } } });

    // 2) Referral bonus on the referee's FIRST completed order.
    const ref = await prisma.referral.findUnique({ where: { refereeId: order.householdId } });
    if (ref && ref.status === 'PENDING') {
      const completed = await prisma.order.count({ where: { householdId: order.householdId, status: 'COMPLETED' } });
      if (completed >= 1) {
        await prisma.referral.update({ where: { id: ref.id }, data: { status: 'PAID', reward: REFERRAL_BONUS, rewardedAt: new Date() } });
        await postTxn(ref.referrerId, 'REFERRAL', REFERRAL_BONUS, { note: 'Referral bonus' });
        await postTxn(ref.refereeId,  'REFERRAL', REFERRAL_BONUS, { note: 'Welcome bonus' });
        await notify(ref.referrerId, { title: 'Referral bonus 🎉', body: `TZS ${REFERRAL_BONUS.toLocaleString()} — your friend completed their first order!`, type: 'payout' }).catch(() => {});
        await notify(ref.refereeId,  { title: 'Welcome bonus 🎉', body: `TZS ${REFERRAL_BONUS.toLocaleString()} added to your wallet.`, type: 'payout' }).catch(() => {});
      }
    }
  } catch { /* best-effort — never block order completion */ }
}
