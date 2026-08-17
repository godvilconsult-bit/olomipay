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
import { Search, Store, PackageSearch, SlidersHorizontal, BadgeCheck } from 'lucide-react';
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
      {/* Hero — the first thing a visitor sees, so it states what this is and
          gives one honest number rather than a marketing claim. */}
      <div className="mb-5">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-ink dark:text-sand sm:text-4xl">
          {t('Buy anything,', 'Nunua chochote,')}{' '}
          <span className="bg-grad-brand bg-clip-text text-transparent">
            {t('delivered', 'kiletwe')}
          </span>
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-ink/60 dark:text-sand/60">
          {t('Compare sellers, order, and track it to your door. No account needed to browse.',
             'Linganisha wauzaji, agiza, na fuatilia hadi mlangoni. Hakuna akaunti inahitajika kuvinjari.')}
        </p>
        {total > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
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

      <SellerCallout />

      {/* Search */}
      <div className="sticky top-[53px] z-10 -mx-4 mb-3 bg-sand/80 px-4 py-2 backdrop-blur dark:bg-ink/80">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" size={18} />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search products…"
              aria-label="Search products"
              className="min-h-touch w-full rounded-2xl border border-black/10 bg-white pl-10 pr-4 text-ink outline-none focus:border-flame focus:ring-2 focus:ring-flame/20 dark:border-white/10 dark:bg-ink-2 dark:text-sand"
            />
          </div>
          <Button variant="ghost" onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}>
            <SlidersHorizontal size={16} />
          </Button>
        </div>
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
      {showFilters && (
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

      {/* Results */}
      {loading ? <Spinner /> : products.length === 0 ? (
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
          <div className="text-[15px] font-extrabold tabular-nums text-flame">
            {formatCatalogMoney(product.from)}
          </div>
          {/* The competing-sellers count is the marketplace signal — it tells the
              buyer this is a market, not one shop's shelf. */}
          <div className="mt-0.5 text-[11px] text-ink/45">
            {product.sellerCount === 1
              ? t('1 seller', 'muuzaji 1')
              : `${product.sellerCount} ${t('sellers', 'wauzaji')}`}
          </div>
        </div>
      </Card>
    </Link>
  );
}
