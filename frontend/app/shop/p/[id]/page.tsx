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
import { BadgeCheck, Store, Star, ArrowLeft, ShieldCheck, Truck, Wallet } from 'lucide-react';
import { getProduct } from '../../../../lib/catalogServer';
import { formatMoney } from '../../../../lib/money';
import ContactSellerButton from '../../../../components/ContactSellerButton';
import BuyCta from '../../../../components/BuyCta';
import ProductGallery from '../../../../components/ProductGallery';
import MarketplaceHeader from '../../../../components/MarketplaceHeader';

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
  const soldCount: number = (p as any).soldCount ?? 0;

  // Offers arrive cheapest-first from the API.
  const best = offers[0];
  const dearest = offers[offers.length - 1];
  const spread = best && dearest && dearest.price > 0
    ? ((dearest.price - best.price) / dearest.price) * 100
    : 0;

  return (
    <>
    <MarketplaceHeader />
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 lg:px-6">
      {/* Breadcrumbs rather than a lone Back link: they show where the product
          sits in the catalog, give a one-click route into its category, and are
          read by crawlers on a page that already renders server-side. */}
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-[13px] text-ink/50">
        <Link href="/shop" className="hover:text-flame">Marketplace</Link>
        {p.category?.name && (
          <>
            <span aria-hidden className="text-ink/25">›</span>
            <Link href={`/shop?category=${p.category.key}`} className="hover:text-flame">
              {p.category.name}
            </Link>
          </>
        )}
        <span aria-hidden className="text-ink/25">›</span>
        <span className="truncate text-ink/70 dark:text-sand/70" aria-current="page">{p.name}</span>
      </nav>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_290px]">
        <ProductGallery images={gallery} alt={p.name} />

        <div>
          {p.category?.name && (
            <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">{p.category.name}</div>
          )}
          <h1 className="mt-1 text-2xl font-extrabold text-ink dark:text-sand">{p.name}</h1>

          {/* Trust line, the way a trading marketplace leads: what other buyers
              have done, and who stands behind it. Every figure here is real —
              units sold comes from delivered orders, the rating is the seller's
              own. A product star score would have to be invented, since reviews
              are recorded against sellers rather than products. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            {soldCount > 0 && (
              <span className="font-semibold text-ink/70 dark:text-sand/70">
                {soldCount.toLocaleString()} sold
              </span>
            )}
            {best?.seller && best.seller.ratingCount > 0 && (
              <span className="inline-flex items-center gap-1 text-ink/60 dark:text-sand/60">
                <Star size={13} className="fill-amber-400 text-amber-400" />
                {best.seller.rating.toFixed(1)}
                <span className="text-ink/40">({best.seller.ratingCount} seller reviews)</span>
              </span>
            )}
            {offers.length > 1 && (
              <span className="text-ink/50">{offers.length} sellers competing</span>
            )}
            {soldCount === 0 && (
              <span className="text-ink/45">New listing</span>
            )}
          </div>

          {/* Price block. The unit and any minimum order sit with the number,
              because "19,000" means something different per bag than per pallet
              — and a wholesale listing that hides its MOQ wastes everyone's time. */}
          {p.from && (
            <div className="mt-3 rounded-ds-xl bg-gradient-to-br from-flame/[0.07] to-amber-400/[0.04] p-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[32px] font-extrabold leading-none tabular-nums text-flame">
                  {formatMoney(p.from.price, p.from.currency)}
                </span>
                {p.category?.unitType && (
                  <span className="text-sm font-medium text-ink/50">/ {p.category.unitType}</span>
                )}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/60 dark:text-sand/60">
                {offers.length > 1 && (
                  <span className="font-semibold text-leaf-dark">
                    Lowest of {offers.length} sellers
                  </span>
                )}
                {best?.moq && best.moq > 1 && (
                  <span>Minimum order <strong className="text-ink dark:text-sand">{best.moq}</strong></span>
                )}
                {best && (
                  <span className={best.inStock ? 'text-leaf-dark' : 'text-danger'}>
                    {best.inStock ? `${best.stock} in stock` : 'Out of stock'}
                  </span>
                )}
              </div>

              {/* Price spread is the single most useful fact on a marketplace
                  product page: it tells a buyer whether comparing is worth it. */}
              {offers.length > 1 && spread > 0 && (
                <div className="mt-2 text-[11px] text-ink/50">
                  Sellers range {formatMoney(offers[0].price, offers[0].currency)} –{' '}
                  {formatMoney(offers[offers.length - 1].price, offers[offers.length - 1].currency)}
                  <span className="ml-1 font-semibold text-flame">
                    (save up to {Math.round(spread)}%)
                  </span>
                </div>
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

        {/* Action rail. Seller identity and the ways to reach them sit together,
            because on a marketplace a buyer is judging both at once — the price
            means little until they know who is behind it. */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-ds-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-ink-2">
            {best?.seller && (
              <>
                <Link href={"/shop/s/" + best.seller.slug} className="flex items-center gap-2.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-black/5 dark:bg-white/10">
                    <Store size={19} className="text-ink/40" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 truncate text-sm font-bold text-ink hover:text-flame dark:text-sand">
                      {best.seller.name}
                      {best.seller.isVerified && <BadgeCheck size={14} className="shrink-0 text-leaf-dark" />}
                    </span>
                    {/* Verification status is stated either way. Silence on an
                        unverified seller reads as endorsement. */}
                    <span className="block text-[11px] text-ink/50">
                      {best.seller.isVerified ? "Verified supplier" : "Not yet verified"}
                      {best.seller.ratingCount > 0
                        ? " · " + best.seller.rating.toFixed(1) + "★ (" + best.seller.ratingCount + ")"
                        : ""}
                    </span>
                  </span>
                </Link>

                <Link
                  href={"/shop/s/" + best.seller.slug}
                  className="mt-2 block rounded-xl border border-black/10 py-2 text-center text-xs font-semibold text-ink/70 hover:border-flame hover:text-flame dark:border-white/10 dark:text-sand/70"
                >
                  View company profile
                </Link>

                <div className="my-3 h-px bg-black/5 dark:bg-white/10" />
              </>
            )}

            <ContactSellerButton productId={p.id} productName={p.name} />
            <BuyCta productId={p.id} />

            <div className="mt-4 space-y-2 border-t border-black/5 pt-3 text-[11px] dark:border-white/10">
              <div className="font-bold text-ink/80 dark:text-sand/80">Buyer protection</div>
              {/* Only claims this platform actually honours — borrowed
                  guarantees are worse than none once a buyer tests them. */}
              <div className="flex items-start gap-1.5 text-ink/60 dark:text-sand/60">
                <ShieldCheck size={13} className="mt-0.5 shrink-0 text-leaf-dark" />
                <span>Confirm delivery before payment is released.</span>
              </div>
              <div className="flex items-start gap-1.5 text-ink/60 dark:text-sand/60">
                <Truck size={13} className="mt-0.5 shrink-0 text-flame" />
                <span>Track it on a live map to your door.</span>
              </div>
              <div className="flex items-start gap-1.5 text-ink/60 dark:text-sand/60">
                <Wallet size={13} className="mt-0.5 shrink-0 text-ink/40" />
                <span>Mobile money, bank transfer or cash on delivery.</span>
              </div>
            </div>
          </div>
        </aside>
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

        {/* Contact and account CTAs now live in the action rail above, beside
            the seller they apply to. Repeating them here would give a buyer two
            competing "Message seller" buttons on one page. */}
      </section>
    </div>
    </>
  );
}
