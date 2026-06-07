'use client';

/**
 * Shared wallet store — one source of truth for balance + FX rate across the app.
 *
 * Before this, the hero card and several pages each fetched /wallet/balance and
 * /mpesa/rate independently on every mount → duplicate network calls and a
 * flash of loading on each screen. Now they share a cached snapshot:
 *   • instant paint from cache when navigating between screens
 *   • a single in-flight request is de-duped across all subscribers
 *   • a background refresh only when the data is stale (TTL)
 *   • invalidate() after a money action to force-refresh everywhere at once
 */
import { useEffect, useState } from 'react';
import { wallet, mobile_money } from './api';

export interface WalletSnapshot {
  usdc:      string;
  tzsRate:   number;
  fetchedAt: number;   // epoch ms; 0 = never
}

const TTL_MS = 30_000;

let snapshot: WalletSnapshot = { usdc: '0', tzsRate: 2600, fetchedAt: 0 };
let inflight: Promise<WalletSnapshot> | null = null;
const subscribers = new Set<() => void>();

function emit() { subscribers.forEach(fn => fn()); }

async function fetchNow(): Promise<WalletSnapshot> {
  const [balRes, rateRes] = await Promise.all([
    wallet.balance(),
    mobile_money.rate().catch(() => ({ usdcToTzs: snapshot.tzsRate })),
  ]);
  snapshot = {
    usdc:      balRes?.balance?.usdc ?? snapshot.usdc,
    tzsRate:   rateRes?.usdcToTzs ?? snapshot.tzsRate,
    fetchedAt: Date.now(),
  };
  emit();
  return snapshot;
}

/** Refresh the snapshot. De-dupes concurrent callers; respects TTL unless forced. */
export function refreshWallet(force = false): Promise<WalletSnapshot> {
  const fresh = Date.now() - snapshot.fetchedAt < TTL_MS;
  if (!force && fresh) return Promise.resolve(snapshot);
  if (inflight) return inflight;
  inflight = fetchNow().finally(() => { inflight = null; });
  return inflight;
}

/** Call after any action that changes the balance (send, deposit, withdraw…). */
export function invalidateWallet() {
  snapshot = { ...snapshot, fetchedAt: 0 };
  refreshWallet(true).catch(() => {});
}

/**
 * Subscribe to the shared balance. Returns the cached snapshot immediately
 * (instant paint) and refreshes in the background when stale.
 */
export function useWallet() {
  const [snap, setSnap] = useState<WalletSnapshot>(snapshot);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const onChange = () => setSnap(snapshot);
    subscribers.add(onChange);
    onChange(); // sync to latest in case it changed before subscribe
    // Background refresh (silent if we already have fresh cache)
    refreshWallet().catch(() => {});
    return () => { subscribers.delete(onChange); };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try { await refreshWallet(true); } finally { setRefreshing(false); }
  };

  const loading = snap.fetchedAt === 0;
  return {
    usdc:    snap.usdc,
    usdcNum: parseFloat(snap.usdc || '0'),
    tzsRate: snap.tzsRate,
    loading,
    refreshing,
    refresh,
  };
}
