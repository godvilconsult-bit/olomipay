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
import { catalog, type CatalogProduct, type CatalogCategory } from '../../lib/api';
import { formatCatalogMoney } from '../../lib/money';
import { Card, Pill, Spinner, EmptyState, Button, cn } from '../../components/ui';

type Sort = 'price_asc' | 'price_desc' | 'newest' | 'name';

export default function ShopPage() {
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
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-ink dark:text-sand">Marketplace</h1>
        <p className="mt-1 text-sm text-ink/60 dark:text-sand/60">
          Browse everything on sale — no account needed.
        </p>
      </div>

      {/* Search */}
      <div className="sticky top-0 z-10 -mx-4 mb-3 bg-sand/80 px-4 py-2 backdrop-blur dark:bg-ink/80">
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
  );
}

function ProductCard({ product }: { product: CatalogProduct }) {
  const attrs = product.attributes ?? {};
  return (
    <Link href={`/shop/p/${product.id}`} className="block">
      <Card className="h-full transition hover:shadow-lg">
        <div className="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-ds-xl bg-black/5 dark:bg-white/5">
          {product.imageUrl
            ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
            : <Store className="text-ink/20" size={32} />}
        </div>

        <div className="line-clamp-2 text-sm font-semibold text-ink dark:text-sand">{product.name}</div>

        {typeof attrs.brand === 'string' && (
          <div className="mt-0.5 text-xs text-ink/50">{attrs.brand}</div>
        )}

        <div className="mt-1.5 font-extrabold tabular-nums text-flame">
          {formatCatalogMoney(product.from)}
        </div>

        {/* The competing-sellers count is the marketplace signal — it tells the
            buyer this is a market, not a single shop's shelf. */}
        <div className="mt-0.5 text-[11px] text-ink/50">
          {product.sellerCount === 1 ? '1 seller' : `${product.sellerCount} sellers`}
        </div>

        {product.bestOffer?.seller?.isVerified && (
          <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-leaf-dark">
            <BadgeCheck size={12} /> Verified seller
          </div>
        )}
      </Card>
    </Link>
  );
}
