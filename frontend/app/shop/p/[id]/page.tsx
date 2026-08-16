/**
 * Product detail — a server component, deliberately.
 *
 * This page is the marketplace's unit of shareable, indexable content, so it
 * renders on the server: crawlers and link previews get real content rather
 * than an empty shell that fills in after JavaScript runs.
 *
 * It is also the page that justifies splitting Offer from Product. One product,
 * every seller who stocks it, cheapest first — impossible while stock lives on
 * a per-vendor Inventory row.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, Store, Star, ArrowLeft } from 'lucide-react';
import { getProduct } from '../../../../lib/catalogServer';
import { formatMoney } from '../../../../lib/money';

interface Props { params: { id: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getProduct(params.id);
  if (!data?.product) return { title: 'Product not found' };

  const p = data.product;
  const from = p.from ? formatMoney(p.from.price, p.from.currency) : null;
  const description = [
    from && `From ${from}`,
    p.sellerCount > 0 && `${p.sellerCount} seller${p.sellerCount === 1 ? '' : 's'}`,
    p.category?.name,
  ].filter(Boolean).join(' · ');

  return {
    title: `${p.name} — JIKO CONNECT`,
    description,
    openGraph: {
      title: p.name,
      description,
      images: p.imageUrl ? [p.imageUrl] : undefined,
      type: 'website',
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const data = await getProduct(params.id);
  if (!data?.product) notFound();

  const p = data.product;
  const attrs = (p.attributes ?? {}) as Record<string, any>;
  const offers = p.offers ?? [];
  // The API always returns an array, falling back to the legacy single image.
  const gallery: string[] = Array.isArray((p as any).images) ? (p as any).images : (p.imageUrl ? [p.imageUrl] : []);
  const description: string | null = (p as any).description ?? null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4">
      <Link href="/shop" className="mb-3 inline-flex items-center gap-1 text-sm text-ink/60 hover:text-flame">
        <ArrowLeft size={16} /> Back to marketplace
      </Link>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-ds-xl bg-black/5 dark:bg-white/5">
            {gallery.length > 0
              ? <img src={gallery[0]} alt={p.name} className="h-full w-full object-cover" />
              : <Store className="text-ink/20" size={64} />}
          </div>

          {/* Remaining shots. Kept static so the page still renders on the
              server and stays indexable; a lightbox would cost that. */}
          {gallery.length > 1 && (
            <div className="mt-2 grid grid-cols-4 gap-2">
              {gallery.slice(0, 4).map((src, i) => (
                <div key={i} className="aspect-square overflow-hidden rounded-xl bg-black/5 dark:bg-white/5">
                  <img src={src} alt={`${p.name} — ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          {p.category?.name && (
            <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">{p.category.name}</div>
          )}
          <h1 className="mt-1 text-2xl font-extrabold text-ink dark:text-sand">{p.name}</h1>

          {p.from && (
            <div className="mt-2">
              <span className="text-3xl font-extrabold tabular-nums text-flame">
                {formatMoney(p.from.price, p.from.currency)}
              </span>
              {offers.length > 1 && (
                <span className="ml-2 text-sm text-ink/50">lowest of {offers.length} offers</span>
              )}
            </div>
          )}

          {/* Category-defined attributes render generically — no gas-specific
              fields in this component, which is what makes it work for any
              vertical without a code change. */}
          {Object.keys(attrs).length > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {Object.entries(attrs).map(([k, v]) => (
                <div key={k} className="rounded-ds-xl bg-black/5 px-3 py-2 dark:bg-white/5">
                  <dt className="text-[11px] uppercase tracking-wide text-ink/50">{k}</dt>
                  <dd className="font-semibold text-ink dark:text-sand">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {description && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-bold text-ink dark:text-sand">About this product</h2>
          {/* whitespace-pre-line keeps the seller's own line breaks without
              rendering their text as HTML. */}
          <p className="max-w-prose whitespace-pre-line text-sm leading-relaxed text-ink/75 dark:text-sand/75">
            {description}
          </p>
        </section>
      )}

      {/* Competing offers */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-ink dark:text-sand">
          {offers.length === 0 ? 'No sellers yet' : `Available from ${offers.length} seller${offers.length === 1 ? '' : 's'}`}
        </h2>

        {offers.length === 0 ? (
          <p className="text-sm text-ink/50">Nobody is currently offering this product.</p>
        ) : (
          <div className="divide-y divide-black/5 overflow-hidden rounded-ds-xl bg-white dark:divide-white/5 dark:bg-ink-2">
            {offers.map((o, i) => (
              <div key={o.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {o.seller ? (
                      <Link href={`/shop/s/${o.seller.slug}`} className="truncate font-semibold text-ink hover:text-flame dark:text-sand">
                        {o.seller.name}
                      </Link>
                    ) : <span className="truncate font-semibold text-ink dark:text-sand">Seller</span>}
                    {o.seller?.isVerified && <BadgeCheck size={14} className="shrink-0 text-leaf-dark" />}
                    {i === 0 && offers.length > 1 && (
                      <span className="shrink-0 rounded-full bg-leaf/15 px-2 py-0.5 text-[10px] font-bold text-leaf-dark">
                        BEST PRICE
                      </span>
                    )}
                  </div>

                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink/50">
                    {o.seller && o.seller.ratingCount > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <Star size={11} className="fill-amber-400 text-amber-400" />
                        {o.seller.rating.toFixed(1)} ({o.seller.ratingCount})
                      </span>
                    )}
                    {o.seller?.kind && <span className="capitalize">{o.seller.kind.toLowerCase()}</span>}
                    {/* A minimum order quantity is how a wholesale listing
                        announces itself; retail offers simply omit it. */}
                    {o.moq > 1 && <span>min {o.moq}</span>}
                    <span className={o.inStock ? 'text-leaf-dark' : 'text-danger'}>
                      {o.inStock ? `${o.stock} in stock` : 'Out of stock'}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="font-extrabold tabular-nums text-ink dark:text-sand">
                    {formatMoney(o.price, o.currency)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-ink/50">
          Sign in to place an order. Browsing is open to everyone.
        </p>
      </section>
    </div>
  );
}
