'use client';

/**
 * The storefront — catalog-first browse.
 *
 * This is the inversion described in §4 of the refactor doc: the old household
 * home asks "which vendors near me have stock", so a product only exists as
 * somebody's inventory row. Here the catalog is the front door, open to anyone
 * with no login and no location, and fulfilment is resolved afterwards.
 */
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, Store, PackageSearch, SlidersHorizontal, BadgeCheck, Package, Truck, ShieldCheck } from 'lucide-react';
import { catalog, getAccessToken, type CatalogProduct, type CatalogCategory } from '../../lib/api';
import { formatCatalogMoney } from '../../lib/money';
import { Card, Pill, Spinner, EmptyState, Button, cn } from '../../components/ui';
import MarketplaceHeader from '../../components/MarketplaceHeader';
import { useT } from '../../lib/i18n';

type Sort = 'price_asc' | 'price_desc' | 'newest' | 'name';

export default function ShopPage() {
  const { t } = useT();
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [products,   setProducts]   = useState<CatalogProduct[]>([]);
  const [brands,     setBrands]     = useState<{ name: string; count: number }[]>([]);
  const [total,      setTotal]      = useState(0);

  const [q,        setQ]        = useState('');
  const [search,   setSearch]   = useState('');   // debounced value actually sent
  const [category, setCategory] = useState<string>('');
  const [brand,    setBrand]    = useState<string>('');
  const [sort,     setSort]     = useState<Sort>('price_asc');
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const LIMIT = 24;

  useEffect(() => {
    catalog.categories()
      .then(r => setCategories(r.flat.filter(c => c.productCount > 0)))
      .catch(() => setCategories([]));
  }, []);

  // The mega-menu links here as /shop?category=key, and verified sellers as
  // ?verified=1. Read from window rather than useSearchParams, which would force
  // this prerendered page behind a Suspense boundary.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const cat = p.get('category');
      if (cat) setCategory(cat);
      const q0 = p.get('q');
      if (q0) { setQ(q0); setSearch(q0); }
    } catch {}
  }, []);

  // Debounce so a search doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => { setSearch(q); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await catalog.products({
        q: search || undefined,
        category: category || undefined,
        brand: brand || undefined,
        sort, page, limit: LIMIT,
      });
      setProducts(r.products);
      setBrands(r.facets.brands.slice(0, 12));
      setTotal(r.total);
    } catch {
      setProducts([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, category, brand, sort, page]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <>
      <MarketplaceHeader />
      <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-5 lg:px-6">
      {/* Hero band — scope tabs above a single dominant search, the shape large
          trading marketplaces converge on. The soft wash lifts it off the page
          without a stock photo behind it. */}
      <div className="-mx-4 mb-6 bg-gradient-to-b from-flame/[0.07] via-amber-400/[0.04] to-transparent px-4 pb-6 pt-5 lg:-mx-6 lg:px-6 lg:pb-8 lg:pt-7">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink dark:text-sand sm:text-[34px]">
            {t('Buy anything,', 'Nunua chochote,')}{' '}
            <span className="bg-grad-brand bg-clip-text text-transparent">
              {t('delivered', 'kiletwe')}
            </span>
          </h1>
          <p className="mx-auto mt-1.5 max-w-lg text-sm text-ink/60 dark:text-sand/60">
            {t('Compare sellers across Africa, order, and track it to your door.',
               'Linganisha wauzaji kote Afrika, agiza, na fuatilia hadi mlangoni.')}
          </p>

          {/* Scope tabs. Products searches here; the others are separate
              surfaces, so they navigate rather than pretending to filter. */}
          <div className="mt-4 flex items-center justify-center gap-5 text-[15px] font-bold">
            <span className="relative text-flame">
              {t('Products', 'Bidhaa')}
              <span className="absolute -bottom-1.5 left-0 h-[3px] w-full rounded-full bg-flame" />
            </span>
            <Link href="/shop?verified=1" className="text-ink/45 transition hover:text-ink/70 dark:text-sand/45">
              {t('Sellers', 'Wauzaji')}
            </Link>
            <Link href="/freight" className="text-ink/45 transition hover:text-ink/70 dark:text-sand/45">
              {t('Freight', 'Usafirishaji')}
            </Link>
          </div>

          <div className="mt-4">
            <div className="flex items-center gap-1.5 rounded-full border-2 border-flame/70 bg-white p-1.5 shadow-lg focus-within:border-flame dark:bg-ink-2">
              <Search className="ml-2.5 shrink-0 text-ink/35" size={19} />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={t('Search products, brands, categories…', 'Tafuta bidhaa, chapa, makundi…')}
                aria-label={t('Search products', 'Tafuta bidhaa')}
                className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-ink outline-none placeholder:text-ink/35 dark:text-sand"
              />
              <button
                type="button"
                onClick={() => { setSearch(q); setPage(1); }}
                className="shrink-0 rounded-full bg-grad-brand px-6 py-2.5 text-sm font-bold text-white shadow-ds-btn active:scale-[0.98]"
              >
                {t('Search', 'Tafuta')}
              </button>
            </div>
          </div>

          {/* Honest counts, not marketing claims. */}
          {total > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf/10 px-2.5 py-1 font-semibold text-leaf-dark">
                <span className="h-1.5 w-1.5 rounded-full bg-leaf" />
                {total} {t(total === 1 ? 'product on sale' : 'products on sale', 'bidhaa zinapatikana')}
              </span>
              {categories.length > 0 && (
                <span className="rounded-full bg-black/5 px-2.5 py-1 font-medium text-ink/60 dark:bg-white/10 dark:text-sand/60">
                  {categories.length} {t('categories', 'makundi')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Trust rail — the reassurances a first-time buyer looks for, and each
            one is true of this platform rather than aspirational. */}
        <div className="mx-auto mt-6 grid max-w-4xl grid-cols-3 gap-3">
          {[
            { icon: BadgeCheck, title: t('Verified sellers', 'Wauzaji halali'), sub: t('Identity checked', 'Utambulisho umethibitishwa') },
            { icon: Truck,      title: t('Live tracking', 'Ufuatiliaji'),       sub: t('Watch it to your door', 'Fuatilia hadi mlangoni') },
            { icon: ShieldCheck,title: t('Pay on delivery', 'Lipa ukipokea'),   sub: t('Confirm before you pay', 'Thibitisha kabla ya kulipa') },
          ].map(x => {
            const Icon = x.icon;
            return (
              <div key={x.title} className="flex items-center gap-2.5 rounded-ds-xl bg-white/70 px-3 py-2.5 shadow-ds-card dark:bg-ink-2/70">
                <Icon size={20} className="shrink-0 text-flame" />
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-bold text-ink dark:text-sand">{x.title}</div>
                  <div className="truncate text-[10px] text-ink/50 dark:text-sand/50">{x.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <SellerCallout />

      {/* Tiles only on the unfiltered home — above someone's search results they
          would just push the results they asked for off the screen. */}
      {!search && !category && (
        <CategoryTiles
          categories={categories}
          onPick={(key) => { setCategory(key); setPage(1); }}
        />
      )}

      {/* Search */}
      {/* The search input lives in the hero now; this row is filters only, and
          shows what is currently narrowing the results so it can be cleared. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* Hidden from lg up, where the panel below is always open — a filter
            behind a button costs a click on every refinement, and on desktop
            there is room to just show them. */}
        <Button className="lg:hidden" variant="ghost" onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}>
          <SlidersHorizontal size={16} /> {t('Filters', 'Vichujio')}
        </Button>
        {(search || category || brand) && (
          <button
            onClick={() => { setQ(''); setSearch(''); setCategory(''); setBrand(''); setPage(1); }}
            className="inline-flex items-center gap-1 rounded-full bg-flame/10 px-3 py-1.5 text-xs font-semibold text-flame"
          >
            {t('Clear filters', 'Ondoa vichujio')} ×
          </button>
        )}
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <Pill active={category === ''} onClick={() => { setCategory(''); setPage(1); }}>All</Pill>
          {categories.map(c => (
            <Pill key={c.id} active={category === c.key} onClick={() => { setCategory(c.key); setPage(1); }}>
              {c.name} ({c.productCount})
            </Pill>
          ))}
        </div>
      )}

      {/* Filters */}
      {/* Always rendered on desktop, toggled on phone. */}
      <div className={cn(showFilters ? 'block' : 'hidden', 'lg:block')}>
      {(
        <Card className="mb-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Sort</div>
          <div className="mb-3 flex flex-wrap gap-2">
            {([
              ['price_asc',  'Price: low to high'],
              ['price_desc', 'Price: high to low'],
              ['newest',     'Newest'],
              ['name',       'Name'],
            ] as [Sort, string][]).map(([value, label]) => (
              <Pill key={value} active={sort === value} onClick={() => { setSort(value); setPage(1); }}>{label}</Pill>
            ))}
          </div>

          {brands.length > 0 && (
            <>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Brand</div>
              <div className="flex flex-wrap gap-2">
                <Pill active={brand === ''} onClick={() => { setBrand(''); setPage(1); }}>Any</Pill>
                {brands.map(b => (
                  <Pill key={b.name} active={brand === b.name} onClick={() => { setBrand(b.name); setPage(1); }}>
                    {b.name} ({b.count})
                  </Pill>
                ))}
              </div>
            </>
          )}
        </Card>
      )}
      </div>

      {/* Results. Skeletons rather than a spinner: they hold the grid's shape so
          the page does not jump when results arrive, and they read as "nearly
          there" instead of "nothing yet". */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="mb-2.5 aspect-square rounded-ds-xl bg-black/[0.06] dark:bg-white/10" />
              <div className="mb-1.5 h-2 w-1/3 rounded bg-black/[0.06] dark:bg-white/10" />
              <div className="mb-1 h-3 w-full rounded bg-black/[0.06] dark:bg-white/10" />
              <div className="mb-2.5 h-3 w-2/3 rounded bg-black/[0.06] dark:bg-white/10" />
              <div className="h-4 w-1/2 rounded bg-black/[0.08] dark:bg-white/[0.14]" />
            </Card>
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={<PackageSearch size={40} />}
          title="Nothing matches that yet"
          sub="Try a different search, or clear the filters."
        />
      ) : (
        <>
          <div className="mb-2 text-xs text-ink/50">{total} product{total === 1 ? '' : 's'}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
          <span className="text-sm tabular-nums text-ink/60">{page} / {pages}</span>
          <Button variant="ghost" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>Next</Button>
        </div>
      )}
      </div>
    </>
  );
}

/**
 * "Categories for you" — the tile grid a marketplace home opens with.
 *
 * Shown only on the unfiltered view: once someone has picked a category or
 * typed a search, tiles are just noise above their results.
 *
 * Categories carry no imagery yet, so each tile gets a deterministic tint
 * derived from its key. That keeps the grid visually varied and stable across
 * renders without inventing stock photos that would misrepresent stock.
 */
const TINTS = [
  'from-orange-500/15 to-amber-400/10 text-orange-600',
  'from-emerald-500/15 to-teal-400/10 text-emerald-600',
  'from-sky-500/15 to-cyan-400/10 text-sky-600',
  'from-violet-500/15 to-fuchsia-400/10 text-violet-600',
  'from-rose-500/15 to-pink-400/10 text-rose-600',
  'from-lime-500/15 to-green-400/10 text-lime-700',
  'from-indigo-500/15 to-blue-400/10 text-indigo-600',
  'from-amber-600/15 to-yellow-400/10 text-amber-700',
];

function CategoryTiles(
  { categories, onPick }: { categories: CatalogCategory[]; onPick: (key: string) => void },
) {
  const { t } = useT();
  if (categories.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="text-base font-extrabold text-ink dark:text-sand">
          {t('Categories for you', 'Makundi kwako')}
        </h2>
        <span className="text-xs text-ink/45">
          {categories.length} {t('with stock', 'zenye bidhaa')}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {categories.map((c, i) => {
          const tint = TINTS[Math.abs(hashKey(c.key)) % TINTS.length];
          return (
            <button
              key={c.id}
              onClick={() => onPick(c.key)}
              className="group flex flex-col items-center gap-1.5 rounded-ds-xl p-2 transition hover:bg-black/[0.03] dark:hover:bg-white/5"
            >
              {/* A real product photo from this category when one exists; the
                  tinted icon is the fallback for a branch nobody has listed in
                  yet. Stock imagery would advertise goods no seller has. */}
              <span className={cn(
                'grid h-16 w-16 place-items-center overflow-hidden rounded-full transition duration-200 group-hover:scale-105',
                c.imageUrl ? 'bg-black/5 dark:bg-white/10' : cn('bg-gradient-to-br', tint),
              )}>
                {c.imageUrl
                  ? <img src={c.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  : <Package size={24} strokeWidth={1.8} />}
              </span>
              <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-ink/80 dark:text-sand/80">
                {c.name}
              </span>
              <span className="text-[10px] text-ink/40">{c.productCount}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Stable per-key tint so a category keeps its colour between renders. */
function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h << 5) - h + key.charCodeAt(i);
  return h;
}

/**
 * The seller's way in.
 *
 * Shown only to signed-out visitors: someone already logged in has Sell in the
 * header and the nav, so repeating it here would just be clutter.
 */
function SellerCallout() {
  const { t } = useT();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => { setSignedIn(!!getAccessToken()); }, []);

  if (signedIn !== false) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-ds-xl border border-flame/20 bg-flame/5 p-3">
      <Store className="shrink-0 text-flame" size={20} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-ink dark:text-sand">
          {t('Have something to sell?', 'Una kitu cha kuuza?')}
        </div>
        <div className="text-xs text-ink/60 dark:text-sand/60">
          {t('List your products and reach buyers near and far — free to start.', 'Orodhesha bidhaa zako ufikie wanunuzi — ni bure kuanza.')}
        </div>
      </div>
      <Link
        href="/auth/register?role=SUPPLIER"
        className="inline-flex min-h-touch shrink-0 items-center gap-1.5 rounded-2xl bg-grad-brand px-4 text-sm font-semibold text-white shadow-ds-btn"
      >
        <Store size={15} /> {t('Start selling', 'Anza kuuza')}
      </Link>
    </div>
  );
}

function ProductCard({ product }: { product: CatalogProduct }) {
  const { t } = useT();
  const attrs = product.attributes ?? {};
  const soldOut = product.bestOffer && !product.bestOffer.inStock;
  const seller = product.bestOffer?.seller;

  return (
    <Link href={`/shop/p/${product.id}`} className="group block">
      <Card className="flex h-full flex-col transition duration-200 hover:-translate-y-0.5 hover:shadow-xl">
        <div className="relative mb-2.5 flex aspect-square items-center justify-center overflow-hidden rounded-ds-xl bg-gradient-to-br from-black/[0.04] to-black/[0.08] dark:from-white/5 dark:to-white/10">
          {product.imageUrl
            ? <img
                src={product.imageUrl}
                alt={product.name}
                loading="lazy"
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
              />
            : <Store className="text-ink/15" size={34} />}

          {/* Trust and availability read faster as image overlays than as text
              rows competing with the price. */}
          {product.bestOffer?.seller?.isVerified && (
            <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-bold text-leaf-dark shadow-sm">
              <BadgeCheck size={10} /> {t('VERIFIED', 'IMETHIBITISHWA')}
            </span>
          )}
          {soldOut && (
            <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1 text-center text-[10px] font-bold text-white">
              {t('OUT OF STOCK', 'HAKUNA')}
            </span>
          )}
        </div>

        {typeof attrs.brand === 'string' && (
          <div className="text-[10px] font-bold uppercase tracking-wide text-flame/70">{attrs.brand}</div>
        )}

        <div className="line-clamp-2 text-sm font-semibold leading-snug text-ink dark:text-sand">
          {product.name}
        </div>

        {/* Price anchored to the bottom so cards with different title lengths
            still line up across the grid. */}
        <div className="mt-auto pt-2">
          <div className="flex items-baseline gap-1">
            <span className="text-[15px] font-extrabold tabular-nums text-flame">
              {formatCatalogMoney(product.from)}
            </span>
            {product.bestOffer?.moq && product.bestOffer.moq > 1 && (
              <span className="text-[10px] font-medium text-ink/45">
                {t('min', 'chini')} {product.bestOffer.moq}
              </span>
            )}
          </div>

          {/* Who you would be buying from. A buyer decides on the seller as much
              as the price, and making them open the product to find out costs a
              click on every comparison. */}
          {seller && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-ink/55 dark:text-sand/55">
              <span className="truncate">{seller.name}</span>
              {seller.isVerified && <BadgeCheck size={11} className="shrink-0 text-leaf-dark" />}
              {seller.ratingCount > 0 && (
                <span className="shrink-0 tabular-nums text-ink/40">★ {seller.rating.toFixed(1)}</span>
              )}
            </div>
          )}

          {/* The competing-sellers count is the marketplace signal — it tells the
              buyer this is a market, not one shop's shelf. */}
          <div className="mt-0.5 text-[11px] text-ink/40">
            {product.sellerCount === 1
              ? t('1 seller', 'muuzaji 1')
              : `${product.sellerCount} ${t('sellers', 'wauzaji')} · ${t('compare', 'linganisha')}`}
          </div>
        </div>
      </Card>
    </Link>
  );
}
