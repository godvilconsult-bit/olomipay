/**
 * Tanzanian mobile-money payments.
 *
 * Designed around ONE aggregator (AzamPay / Selcom / ClickPesa) so a single
 * integration reaches M-Pesa (Vodacom), Mixx by Yas (Tigo), Airtel Money and
 * HaloPesa. The real provider is plugged in behind `PaymentProvider`; until
 * credentials are configured we run a `mock` provider that settles instantly so
 * the full order → pay → deliver loop is demoable offline.
 *
 * Set JIKO_PAYMENTS_PROVIDER=azampay (+ creds) to go live.
 */
import { prisma } from '../lib/prisma';
import { PaymentProvider as DbProvider } from '@prisma/client';
import { notify } from './notify';
import { emitToUser } from '../socket';
import { azampayCheckout, AZAMPAY_CONFIGURED } from './azampay';

const MODE = (process.env.JIKO_PAYMENTS_PROVIDER ?? 'mock').toLowerCase();

/** Guess the mobile-money network from a Tanzanian MSISDN. */
export function providerFromPhone(phone: string): DbProvider {
  const m = phone.replace(/\D/g, '').replace(/^255/, '');
  const p = m.slice(0, 2);
  if (['74', '75', '76'].includes(p)) return 'MPESA';       // Vodacom
  if (['65', '67', '71', '77'].includes(p)) return 'TIGOPESA'; // Mixx by Yas
  if (['68', '69', '78'].includes(p)) return 'AIRTELMONEY';
  if (['62', '61'].includes(p)) return 'HALOPESA';
  return 'MPESA';
}

interface InitResult {
  ref: string;
  status: 'PENDING' | 'PAID';
}

/**
 * Kick off an STK-push collection against the household's wallet. Returns a
 * provider reference; in live mode the provider later calls our webhook to
 * confirm. In mock mode we settle immediately.
 */
export async function initiatePayment(params: {
  orderId: string;
  amount: number;
  phone: string;
  provider?: DbProvider;
}): Promise<InitResult> {
  const provider = params.provider ?? providerFromPhone(params.phone);
  const ref = `PAY-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e4)}`;

  await prisma.payment.update({
    where: { orderId: params.orderId },
    data:  { provider, phone: params.phone, providerRef: ref, status: 'PENDING' },
  });

  if (MODE === 'azampay' && AZAMPAY_CONFIGURED) {
    // Real STK push — stays PENDING until AzamPay calls our webhook.
    try {
      const r = await azampayCheckout({ phone: params.phone, amount: params.amount, externalId: ref, provider });
      if (r.transactionId) {
        await prisma.payment.update({ where: { orderId: params.orderId }, data: { providerRef: ref } });
      }
      return { ref, status: 'PENDING' };
    } catch (e: any) {
      await prisma.payment.update({ where: { orderId: params.orderId }, data: { status: 'FAILED' } });
      throw Object.assign(new Error(e?.response?.data?.message ?? 'Payment request failed'), { http: 502 });
    }
  }

  // Default: mock provider — simulate the user approving the STK push after a beat.
  setTimeout(() => settlePayment(ref, true).catch(() => {}), 1500);
  return { ref, status: 'PENDING' };
}

/**
 * Mark a payment paid/failed by provider reference and notify the parties.
 * Called by the mock timer and by the live webhook (`/api/payments/callback`).
 */
export async function settlePayment(ref: string, success: boolean): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where:   { providerRef: ref },
    include: { order: { select: { id: true, orderNo: true, householdId: true, supplier: { select: { userId: true } } } } },
  });
  if (!payment || !payment.order) return;
  if (payment.status === 'PAID') return; // idempotent

  await prisma.payment.update({
    where: { id: payment.id },
    data:  { status: success ? 'PAID' : 'FAILED', paidAt: success ? new Date() : null },
  });

  const { order } = payment;
  if (success) {
    emitToUser(order.householdId, 'payment:paid', { orderId: order.id, ref });
    await notify(order.householdId, {
      title: 'Payment confirmed ✅',
      body:  `Order ${order.orderNo} is paid. The vendor will confirm shortly.`,
      type:  'payment',
      data:  { orderId: order.id },
    });
    if (order.supplier?.userId) {
      emitToUser(order.supplier.userId, 'payment:paid', { orderId: order.id });
      await notify(order.supplier.userId, { title: 'Payment received 💳', body: `${order.orderNo} is paid. Confirm the order to dispatch it.`, type: 'payment', data: { orderId: order.id } });
    }
  } else {
    emitToUser(order.householdId, 'payment:failed', { orderId: order.id, ref });
  }
}
