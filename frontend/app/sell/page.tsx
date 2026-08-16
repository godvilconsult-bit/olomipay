'use client';

/**
 * Seller listings — create and manage what you sell.
 *
 * The important detail is that this component contains no product-specific
 * fields. The attribute inputs are generated from the chosen category's
 * `attributeSchema`, so listing cement asks for brand, bag weight and grade
 * while a phone asks for model and storage — and adding a new vertical needs no
 * change here at all.
 */
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plus, Trash2, Store, PackagePlus, ExternalLink, Loader2 } from 'lucide-react';
import {
  listings, ApiError,
  type ListingCategory, type MyListing, type AttributeDef,
} from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { Button, Card, Field, Spinner, EmptyState, cn } from '../../components/ui';
import { useT } from '../../lib/i18n';

export default function SellPage() {
  const { t } = useT();

  const [cats, setCats]         = useState<ListingCategory[]>([]);
  const [mine, setMine]         = useState<MyListing[]>([]);
  const [slug, setSlug]         = useState('');
  const [loading, setLoading]   = useState(true);
  const [blocked, setBlocked]   = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    try {
      const r = await listings.mine();
      setMine(r.listings);
      setSlug(r.sellerSlug);
      setBlocked(null);
    } catch (e) {
      // A buyer-only account hits 403 here; say so plainly rather than showing
      // an empty list that looks like a bug.
      setBlocked(e instanceof ApiError && e.status === 403
        ? t('This account is not set up to sell yet.', 'Akaunti hii bado haijawekwa kuuza.')
        : t('Could not load your listings.', 'Imeshindwa kupakia bidhaa zako.'));
    }
  }

  useEffect(() => {
    (async () => {
      await Promise.all([
        listings.categories().then(r => setCats(r.categories)).catch(() => setCats([])),
        refresh(),
      ]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function remove(offerId: string) {
    const prev = mine;
    setMine(m => m.filter(x => x.id !== offerId));   // optimistic
    try {
      await listings.remove(offerId);
      toast.success(t('Listing removed', 'Bidhaa imeondolewa'));
    } catch {
      setMine(prev);
      toast.error(t('Could not remove that listing', 'Imeshindwa kuondoa'));
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink dark:text-sand">{t('My listings', 'Bidhaa zangu')}</h1>
          <p className="mt-1 text-sm text-ink/60 dark:text-sand/60">
            {t('Sell anything — pick a category and add your product.', 'Uza chochote — chagua kundi na ongeza bidhaa yako.')}
          </p>
        </div>
        {slug && (
          <Link href={`/shop/s/${slug}`} className="mt-1 inline-flex shrink-0 items-center gap-1 text-sm font-medium text-flame">
            {t('View storefront', 'Ona duka')} <ExternalLink size={14} />
          </Link>
        )}
      </div>

      {blocked ? (
        <Card><p className="py-6 text-center text-sm text-ink/60">{blocked}</p></Card>
      ) : (
        <>
          {!showForm && (
            <Button className="mb-4 w-full" onClick={() => setShowForm(true)}>
              <Plus size={16} /> {t('Add a product', 'Ongeza bidhaa')}
            </Button>
          )}

          {showForm && (
            <NewListingForm
              categories={cats}
              onCancel={() => setShowForm(false)}
              onCreated={async () => { setShowForm(false); await refresh(); }}
            />
          )}

          {mine.length === 0 ? (
            <EmptyState
              icon={<PackagePlus size={40} />}
              title={t('Nothing listed yet', 'Bado hujaorodhesha')}
              sub={t('Add your first product and it appears in the marketplace immediately.', 'Ongeza bidhaa yako ya kwanza na itaonekana sokoni mara moja.')}
            />
          ) : (
            <div className="mt-4 space-y-2">
              {mine.map(l => (
                <Card key={l.id} className="flex items-center gap-3">
                  <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-ds-xl bg-black/5 dark:bg-white/5">
                    {l.product.imageUrl
                      ? <img src={l.product.imageUrl} alt={l.product.name} className="h-full w-full object-cover" />
                      : <Store className="text-ink/25" size={22} />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-ink dark:text-sand">{l.product.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink/50">
                      {l.product.category?.name && <span>{l.product.category.name}</span>}
                      <span className={l.stock > 0 ? 'text-leaf-dark' : 'text-danger'}>
                        {l.stock > 0 ? `${l.stock} ${t('in stock', 'zipo')}` : t('Out of stock', 'Hakuna')}
                      </span>
                      {l.moq > 1 && <span>{t('min', 'chini')} {l.moq}</span>}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="font-extrabold tabular-nums text-flame">{formatMoney(l.price, l.currency)}</div>
                    <button
                      onClick={() => remove(l.id)}
                      aria-label={t('Remove listing', 'Ondoa bidhaa')}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink/45 hover:text-danger"
                    >
                      <Trash2 size={12} /> {t('Remove', 'Ondoa')}
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── New listing ───────────────────────────────────────────────────────────────

function NewListingForm(
  { categories, onCancel, onCreated }:
  { categories: ListingCategory[]; onCancel: () => void; onCreated: () => void },
) {
  const { t } = useT();
  const [categoryId, setCategoryId] = useState('');
  const [name, setName]   = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [moq, setMoq]     = useState('1');
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const category = useMemo(() => categories.find(c => c.id === categoryId), [categories, categoryId]);
  const schema   = category?.attributeSchema ?? null;
  const props    = schema?.properties ?? {};
  const required = schema?.required ?? [];

  // Switching category invalidates the previous category's attributes.
  function pickCategory(id: string) { setCategoryId(id); setAttrs({}); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) return toast.error(t('Choose a category', 'Chagua kundi'));
    if (!name.trim())  return toast.error(t('Give the product a name', 'Weka jina la bidhaa'));
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) return toast.error(t('Enter a price', 'Weka bei'));

    // Numbers must arrive as numbers — the API validates against the category
    // schema and rejects "50" where a number is declared.
    const typed: Record<string, any> = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (value === '') continue;
      typed[key] = (props[key] as AttributeDef)?.type === 'number' ? Number(value) : value;
    }
    for (const key of required) {
      if (typed[key] === undefined || typed[key] === '') {
        return toast.error(t(`${props[key]?.title ?? key} is required`, `${props[key]?.title ?? key} inahitajika`));
      }
    }

    setSaving(true);
    try {
      const { product } = await listings.createProduct({ categoryId, name: name.trim(), attributes: typed });
      await listings.createOffer({
        productId: product.id,
        price: priceNum,
        stock: Number(stock) || 0,
        moq: Math.max(1, Number(moq) || 1),
      });
      toast.success(t('Listed! It is live in the marketplace.', 'Imeorodheshwa! Ipo sokoni sasa.'));
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('Could not create the listing', 'Imeshindwa kuorodhesha'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink/70 dark:text-sand/70">{t('Category', 'Kundi')}</span>
          <select
            value={categoryId}
            onChange={e => pickCategory(e.target.value)}
            className="min-h-touch w-full rounded-2xl border border-black/10 bg-white px-4 text-ink outline-none focus:border-flame dark:border-white/10 dark:bg-ink-2 dark:text-sand"
          >
            <option value="">{t('Choose a category…', 'Chagua kundi…')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.path}</option>)}
          </select>
        </label>

        <Field
          label={t('Product name', 'Jina la bidhaa')}
          placeholder={t('e.g. Portland Cement 50kg', 'mfano: Simenti 50kg')}
          value={name}
          onChange={e => setName(e.target.value)}
        />

        {/* Generated from the category — no hardcoded product fields here. */}
        {Object.entries(props).map(([key, def]) => {
          const d = def as AttributeDef;
          const label = (d.title ?? key) + (required.includes(key) ? ' *' : '');
          if (d.enum?.length) {
            return (
              <label key={key} className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink/70 dark:text-sand/70">{label}</span>
                <select
                  value={attrs[key] ?? ''}
                  onChange={e => setAttrs(a => ({ ...a, [key]: e.target.value }))}
                  className="min-h-touch w-full rounded-2xl border border-black/10 bg-white px-4 text-ink outline-none focus:border-flame dark:border-white/10 dark:bg-ink-2 dark:text-sand"
                >
                  <option value="">{t('Select…', 'Chagua…')}</option>
                  {d.enum.map(v => <option key={String(v)} value={String(v)}>{String(v)}</option>)}
                </select>
              </label>
            );
          }
          return (
            <Field
              key={key}
              label={label}
              type={d.type === 'number' ? 'number' : 'text'}
              inputMode={d.type === 'number' ? 'decimal' : undefined}
              value={attrs[key] ?? ''}
              onChange={e => setAttrs(a => ({ ...a, [key]: e.target.value }))}
            />
          );
        })}

        <div className="grid grid-cols-3 gap-2">
          <Field label={t('Price', 'Bei')} type="number" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
          <Field label={t('Stock', 'Idadi')} type="number" inputMode="numeric" value={stock} onChange={e => setStock(e.target.value)} />
          <Field
            label={t('Min order', 'Kiwango')}
            type="number" inputMode="numeric" value={moq}
            onChange={e => setMoq(e.target.value)}
            hint={t('1 for retail', '1 kwa rejareja')}
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" loading={saving} className="flex-1">
            {saving ? <Loader2 className="animate-spin" size={16} /> : null}
            {t('Publish listing', 'Chapisha')}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>{t('Cancel', 'Ghairi')}</Button>
        </div>
      </form>
    </Card>
  );
}
