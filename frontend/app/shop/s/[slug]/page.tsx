/**
 * Seller storefront — server-rendered for the same indexing reasons as the
 * product page.
 *
 * A seller here is an Organization, not a map pin: it may be a shop, a
 * wholesaler or a manufacturer, and the same page serves all three because they
 * differ only in `kind` and whether their offers carry a minimum order quantity.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, Store, Star, ArrowLeft } from 'lucide-react';
import { getSeller } from '../../../../lib/catalogServer';
import { formatMoney } from '../../../../lib/money';

interface Props {
  params: { slug: string };
  searchParams: { page?: string };
}

const KIND_LABEL: Record<string, string> = {
  RETAILER:     'Shop',
  WHOLESALER:   'Wholesaler',
  MANUFACTURER: 'Manufacturer',
  CARRIER:      'Transporter',
  INDIVIDUAL:   'Individual',
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getSeller(params.slug);
  if (!data?.seller) return { title: 'Seller not found' };

  const s = data.seller;
  const kind = KIND_LABEL[s.kind] ?? s.kind;
  const description = s.description?.trim()
    || `${kind} on JIKO CONNECT · ${data.total} listing${data.total === 1 ? '' : 's'}`;

  return {
    title: `${s.name} — JIKO CONNECT`,
    description,
    openGraph: { title: s.name, description, images: s.logoUrl ? [s.logoUrl] : undefined, type: 'website' },
  };
}

export default async function SellerPage({ params, searchParams }: Props) {
  const page = Math.max(1, Number(searchParams.page ?? '1') || 1);
  const data = await getSeller(params.slug, page);
  if (!data?.seller) notFound();

  const { seller, listings, total, limit } = data;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-4">
      <Link href="/shop" className="mb-3 inline-flex items-center gap-1 text-sm text-ink/60 hover:text-flame">
        <ArrowLeft size={16} /> Back to marketplace
      </Link>

      {/* Storefront header */}
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-ds-xl bg-black/5 dark:bg-white/5">
          {seller.logoUrl
            ? <img src={seller.logoUrl} alt={seller.name} className="h-full w-full object-cover" />
            : <Store className="text-ink/25" size={28} />}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-ink dark:text-sand">{seller.name}</h1>
            {seller.isVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-leaf/15 px-2 py-0.5 text-xs font-bold text-leaf-dark">
                <BadgeCheck size={12} /> Verified
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink/60 dark:text-sand/60">
            <span>{KIND_LABEL[seller.kind] ?? seller.kind}</span>
            {seller.ratingCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Star size={13} className="fill-amber-400 text-amber-400" />
                {seller.rating.toFixed(1)} ({seller.ratingCount})
              </span>
            )}
            <span>{total} listing{total === 1 ? '' : 's'}</span>
          </div>

          {seller.description && (
            <p className="mt-2 max-w-prose text-sm text-ink/70 dark:text-sand/70">{seller.description}</p>
          )}
        </div>
      </div>

      {/* Listings */}
      {listings.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink/50">This seller has no active listings.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map(({ offer, product }) => (
            <Link key={offer.id} href={`/shop/p/${product.id}`} className="block">
              <div className="h-full rounded-ds-xl border border-black/5 bg-white p-3 shadow-ds-card transition hover:shadow-lg dark:border-white/5 dark:bg-ink-2">
                <div className="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-ds-xl bg-black/5 dark:bg-white/5">
                  {product.imageUrl
                    ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
                    : <Store className="text-ink/20" size={28} />}
                </div>

                <div className="line-clamp-2 text-sm font-semibold text-ink dark:text-sand">{product.name}</div>
                <div className="mt-1 font-extrabold tabular-nums text-flame">
                  {formatMoney(offer.price, offer.currency)}
                </div>
                <div className="mt-0.5 text-[11px] text-ink/50">
                  {offer.inStock ? `${offer.stock} in stock` : 'Out of stock'}
                  {offer.moq > 1 && ` · min ${offer.moq}`}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          {page > 1 && (
            <Link href={`/shop/s/${seller.slug}?page=${page - 1}`} className="rounded-2xl bg-black/5 px-4 py-2 dark:bg-white/10">
              Previous
            </Link>
          )}
          <span className="tabular-nums text-ink/60">{page} / {pages}</span>
          {page < pages && (
            <Link href={`/shop/s/${seller.slug}?page=${page + 1}`} className="rounded-2xl bg-black/5 px-4 py-2 dark:bg-white/10">
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
