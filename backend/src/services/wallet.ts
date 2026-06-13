/**
 * Wallet / ledger. Single source of truth for what the platform owes each
 * rider/supplier (and, when negative, what a rider owes the platform from cash
 * collected on delivery). Every balance change is an append-only WalletTxn.
 */
import { prisma } from '../lib/prisma';
import type { WalletTxnType } from '@prisma/client';

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Post a signed ledger entry and move the balance atomically. Accepts either
 * the base prisma client or a transaction client, so it can be composed inside
 * a larger $transaction (e.g. delivery settlement).
 */
export async function walletPost(
  client: any, userId: string, type: WalletTxnType, amount: number,
  orderId?: string | null, note?: string | null,
): Promise<number> {
  const w = await client.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
  const balanceAfter = round(w.balance + amount);
  await client.wallet.update({ where: { id: w.id }, data: { balance: balanceAfter } });
  await client.walletTxn.create({
    data: { walletId: w.id, type, amount: round(amount), balanceAfter, orderId: orderId ?? null, note: note ?? null },
  });
  return balanceAfter;
}

/** Standalone post (wraps its own transaction). */
export function postTxn(userId: string, type: WalletTxnType, amount: number, opts?: { orderId?: string; note?: string }) {
  return prisma.$transaction((tx) => walletPost(tx, userId, type, amount, opts?.orderId, opts?.note));
}

export async function ensureWallet(userId: string) {
  return prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
}

export async function walletSummary(userId: string) {
  const w = await ensureWallet(userId);
  const txns = await prisma.walletTxn.findMany({ where: { walletId: w.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  return { balance: w.balance, currency: w.currency, txns };
}
