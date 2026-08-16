/**
 * Server-side catalog fetches for the storefront's indexable pages.
 *
 * lib/api.ts runs in the browser (it attaches JWTs from localStorage). Product
 * and seller pages must render on the server so crawlers and link previews see
 * real content, so they use this plain, tokenless fetch instead.
 */
import type { CatalogOffer, CatalogProduct, CatalogSeller } from './api';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Revalidate rather than caching forever: prices and stock move. */
const REVALIDATE_SECONDS = 60;

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // A storefront page must not 500 because the API is briefly unreachable —
    // the caller renders a not-found or empty state instead.
    return null;
  }
}

export function getProduct(id: string) {
  return get<{ product: CatalogProduct & { offers: CatalogOffer[]; category: any } }>(
    `/api/catalog/products/${encodeURIComponent(id)}`,
  );
}

export function getSeller(slug: string, page = 1) {
  return get<{
    seller: CatalogSeller & { description?: string | null; canSell: boolean; canCarry: boolean; currency: string };
    listings: { offer: CatalogOffer; product: CatalogProduct }[];
    total: number; page: number; limit: number;
  }>(`/api/catalog/sellers/${encodeURIComponent(slug)}?page=${page}`);
}
