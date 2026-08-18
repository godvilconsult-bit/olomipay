'use client';

/**
 * Marketplace header, built for a desktop trading site.
 *
 * Two rows, the way large B2B marketplaces structure it:
 *   utility — where you're buying into (country), language, cart, account
 *   primary — the all-categories mega-menu plus the standing entry points
 *
 * On phone it collapses to a single row with a drawer, because a mega-menu is
 * unusable at 375px. This replaces StoreHeader, which was a single thin bar with
 * no category navigation at all — the storefront had no way to browse the tree
 * except the pill row buried under the search box.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  FileText, Flame, ShoppingCart, User, ChevronDown, Menu, X, Search,
  BadgeCheck, Truck, Store, LogIn, UserPlus, MessageSquare, LayoutDashboard, Globe,
} from 'lucide-react';
import { catalog, getAccessToken, type CatalogCategory } from '../lib/api';
import { useT, LangToggle } from '../lib/i18n';
import { cn } from './ui';

/** Markets we serve. Africa-first, which is the whole premise. */
const MARKETS = [
  { code: 'TZ', flag: '🇹🇿', name: 'Tanzania',  currency: 'TZS' },
  { code: 'KE', flag: '🇰🇪', name: 'Kenya',     currency: 'KES' },
  { code: 'UG', flag: '🇺🇬', name: 'Uganda',    currency: 'UGX' },
  { code: 'RW', flag: '🇷🇼', name: 'Rwanda',    currency: 'RWF' },
  { code: 'NG', flag: '🇳🇬', name: 'Nigeria',   currency: 'NGN' },
  { code: 'GH', flag: '🇬🇭', name: 'Ghana',     currency: 'GHS' },
  { code: 'ZA', flag: '🇿🇦', name: 'South Africa', currency: 'ZAR' },
];

const MARKET_KEY = 'jiko_market';

export default function MarketplaceHeader() {
  const { t } = useT();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tree, setTree]   = useState<CatalogCategory[]>([]);
  const [megaOpen, setMega] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [market, setMarket] = useState(MARKETS[0]);
  const megaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSignedIn(!!getAccessToken());
    try {
      const saved = localStorage.getItem(MARKET_KEY);
      const found = MARKETS.find(m => m.code === saved);
      if (found) setMarket(found);
    } catch {}
    // Only categories that actually hold stock — an empty branch in a mega-menu
    // is a dead end that makes the catalog look broken.
    catalog.categories()
      .then(r => setTree(r.categories.filter(c => (c.children ?? []).some(k => k.productCount > 0) || c.productCount > 0)))
      .catch(() => {});
  }, []);

  // Close the mega-menu on outside click and on Escape — a panel this large
  // trapping the user is worse than no panel.
  useEffect(() => {
    if (!megaOpen) return;
    const onClick = (e: MouseEvent) => {
      if (megaRef.current && !megaRef.current.contains(e.target as Node)) setMega(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMega(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [megaOpen]);

  function pickMarket(m: typeof MARKETS[number]) {
    setMarket(m); setMarketOpen(false);
    try { localStorage.setItem(MARKET_KEY, m.code); } catch {}
  }

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-ink/95">
      {/* ── Utility row (desktop only) ──────────────────────────────────── */}
      <div className="hidden border-b border-black/5 lg:block dark:border-white/5">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-1.5 text-xs">
          <div className="flex-1" />

          <div className="relative">
            <button
              onClick={() => setMarketOpen(o => !o)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-ink/70 hover:bg-black/5 dark:text-sand/70"
            >
              <span className="text-ink/45">{t('Deliver to', 'Peleka')}:</span>
              <span className="text-base leading-none">{market.flag}</span>
              <span className="font-semibold">{market.code}</span>
              <ChevronDown size={12} />
            </button>
            {marketOpen && (
              <div className="absolute right-0 top-8 z-50 w-52 rounded-2xl border border-black/5 bg-white p-1.5 shadow-xl dark:bg-ink-2">
                {MARKETS.map(m => (
                  <button
                    key={m.code}
                    onClick={() => pickMarket(m)}
                    className={cn('flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5',
                      m.code === market.code && 'bg-flame/10 font-bold text-flame')}
                  >
                    <span className="text-base leading-none">{m.flag}</span>
                    <span className="flex-1">{m.name}</span>
                    <span className="text-ink/40">{m.currency}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="inline-flex items-center gap-1 text-ink/60 dark:text-sand/60">
            <Globe size={13} /> {market.currency}
          </span>
          <LangToggle />

          <Link href="/orders" aria-label={t('Cart', 'Kikapu')} className="text-ink/60 hover:text-flame dark:text-sand/60">
            <ShoppingCart size={16} />
          </Link>

          {signedIn ? (
            <>
              <Link href="/messages" className="inline-flex items-center gap-1 text-ink/70 hover:text-flame dark:text-sand/70">
                <MessageSquare size={14} /> {t('Messages', 'Ujumbe')}
              </Link>
              <Link href="/dashboard" className="inline-flex items-center gap-1 font-semibold text-ink/80 hover:text-flame dark:text-sand/80">
                <LayoutDashboard size={14} /> {t('My account', 'Akaunti')}
              </Link>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="inline-flex items-center gap-1 text-ink/70 hover:text-flame dark:text-sand/70">
                <User size={14} /> {t('Sign in', 'Ingia')}
              </Link>
              <Link href="/auth/register" className="rounded-full bg-grad-brand px-3.5 py-1.5 font-bold text-white shadow-ds-btn">
                {t('Create account', 'Fungua akaunti')}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ── Primary row ─────────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 lg:px-6">
        <button
          onClick={() => setDrawer(true)}
          aria-label={t('Menu', 'Menyu')}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink/70 hover:bg-black/5 lg:hidden dark:text-sand/70"
        >
          <Menu size={20} />
        </button>

        <Link href="/shop" className="flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-grad-brand text-white shadow-ds-btn">
            <Flame size={18} />
          </span>
          <span className="hidden text-[17px] font-extrabold tracking-tight text-ink dark:text-sand sm:inline">
            JIKO CONNECT
          </span>
        </Link>

        {/* All categories — the mega-menu trigger */}
        <div className="relative hidden lg:block" ref={megaRef}>
          <button
            onClick={() => setMega(o => !o)}
            aria-expanded={megaOpen}
            className={cn('flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition',
              megaOpen ? 'bg-flame/10 text-flame' : 'text-ink/75 hover:bg-black/5 dark:text-sand/75')}
          >
            <Menu size={16} /> {t('All categories', 'Makundi yote')}
            <ChevronDown size={14} className={cn('transition', megaOpen && 'rotate-180')} />
          </button>

          {megaOpen && <MegaMenu tree={tree} onNavigate={() => setMega(false)} />}
        </div>

        <Link href="/shop?verified=1" className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink/75 hover:bg-black/5 lg:flex dark:text-sand/75">
          <BadgeCheck size={16} className="text-leaf-dark" /> {t('Verified sellers', 'Wauzaji halali')}
        </Link>
        <Link href="/rfq" className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink/75 hover:bg-black/5 lg:flex dark:text-sand/75">
          <FileText size={16} /> {t('Request quotes', 'Omba bei')}
        </Link>
        <Link href="/freight" className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink/75 hover:bg-black/5 lg:flex dark:text-sand/75">
          <Truck size={16} /> {t('Freight', 'Usafirishaji')}
        </Link>
        <Link href="/sell" className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink/75 hover:bg-black/5 lg:flex dark:text-sand/75">
          <Store size={16} /> {t('Sell on JIKO', 'Uza JIKO')}
        </Link>

        <div className="flex-1" />

        {/* Compact account actions on phone, where the utility row is hidden. */}
        <div className="flex items-center gap-1.5 lg:hidden">
          {signedIn ? (
            <Link href="/dashboard" aria-label={t('Account', 'Akaunti')} className="grid h-9 w-9 place-items-center rounded-xl bg-grad-brand text-white">
              <User size={17} />
            </Link>
          ) : (
            <>
              <Link href="/auth/login" className="rounded-xl px-2.5 py-2 text-sm font-semibold text-ink/70 dark:text-sand/70">
                {t('Sign in', 'Ingia')}
              </Link>
              <Link href="/auth/register" className="rounded-xl bg-grad-brand px-3 py-2 text-sm font-bold text-white shadow-ds-btn">
                {t('Join', 'Jiunge')}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ── Phone drawer ────────────────────────────────────────────────── */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col overflow-y-auto bg-white p-4 dark:bg-ink-2">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-extrabold text-ink dark:text-sand">{t('Browse', 'Vinjari')}</span>
              <button onClick={() => setDrawer(false)} aria-label={t('Close', 'Funga')} className="text-ink/50">
                <X size={20} />
              </button>
            </div>

            <Link href="/shop" onClick={() => setDrawer(false)} className="flex items-center gap-2 rounded-xl px-2 py-2.5 text-sm font-semibold text-ink dark:text-sand">
              <Search size={16} /> {t('All products', 'Bidhaa zote')}
            </Link>
            <Link href="/freight" onClick={() => setDrawer(false)} className="flex items-center gap-2 rounded-xl px-2 py-2.5 text-sm font-semibold text-ink dark:text-sand">
              <Truck size={16} /> {t('Freight', 'Usafirishaji')}
            </Link>
            <Link href="/sell" onClick={() => setDrawer(false)} className="flex items-center gap-2 rounded-xl px-2 py-2.5 text-sm font-semibold text-ink dark:text-sand">
              <Store size={16} /> {t('Sell on JIKO', 'Uza JIKO')}
            </Link>

            <div className="mb-1 mt-4 px-2 text-[10px] font-bold uppercase tracking-wider text-ink/40">
              {t('Categories', 'Makundi')}
            </div>
            {tree.map(root => (
              <div key={root.id} className="mb-2">
                <Link
                  href={`/shop?category=${root.children?.[0]?.key ?? root.key}`}
                  onClick={() => setDrawer(false)}
                  className="block rounded-xl px-2 py-1.5 text-sm font-bold text-ink dark:text-sand"
                >
                  {root.name}
                </Link>
                {(root.children ?? []).filter(c => c.productCount > 0).map(child => (
                  <Link
                    key={child.id}
                    href={`/shop?category=${child.key}`}
                    onClick={() => setDrawer(false)}
                    className="block rounded-xl px-4 py-1.5 text-[13px] text-ink/65 dark:text-sand/65"
                  >
                    {child.name} <span className="text-ink/35">({child.productCount})</span>
                  </Link>
                ))}
              </div>
            ))}

            {!signedIn && (
              <Link
                href="/auth/register"
                onClick={() => setDrawer(false)}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-2xl bg-grad-brand py-3 text-sm font-bold text-white"
              >
                <UserPlus size={16} /> {t('Create account', 'Fungua akaunti')}
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

/** Two-pane mega-menu: roots on the left, the hovered root's children right. */
function MegaMenu({ tree, onNavigate }: { tree: CatalogCategory[]; onNavigate: () => void }) {
  const { t } = useT();
  const [active, setActive] = useState(0);
  const root = tree[active];

  if (tree.length === 0) {
    return (
      <div className="absolute left-0 top-12 z-50 w-72 rounded-2xl border border-black/5 bg-white p-4 text-sm text-ink/50 shadow-2xl dark:bg-ink-2">
        {t('Categories are loading…', 'Makundi yanapakia…')}
      </div>
    );
  }

  return (
    <div className="absolute left-0 top-12 z-50 flex w-[720px] overflow-hidden rounded-2xl border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-ink-2">
      <div className="w-56 shrink-0 border-r border-black/5 bg-black/[0.02] py-2 dark:border-white/5 dark:bg-white/[0.02]">
        {tree.map((r, i) => (
          <button
            key={r.id}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            className={cn('flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-semibold transition',
              i === active ? 'bg-white text-flame dark:bg-ink-2' : 'text-ink/70 hover:text-ink dark:text-sand/70')}
          >
            {r.name}
            <ChevronDown size={13} className="-rotate-90 opacity-40" />
          </button>
        ))}
      </div>

      <div className="min-w-0 flex-1 p-5">
        <div className="mb-3 text-sm font-extrabold text-ink dark:text-sand">{root.name}</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {(root.children ?? []).map(child => (
            <Link
              key={child.id}
              href={`/shop?category=${child.key}`}
              onClick={onNavigate}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[13px] text-ink/70 hover:bg-flame/5 hover:text-flame dark:text-sand/70"
            >
              <span className="truncate">{child.name}</span>
              <span className="ml-2 shrink-0 text-[11px] text-ink/35">{child.productCount}</span>
            </Link>
          ))}
        </div>
        <Link
          href={`/shop?category=${root.children?.[0]?.key ?? root.key}`}
          onClick={onNavigate}
          className="mt-4 inline-block text-[13px] font-bold text-flame hover:underline"
        >
          {t('Browse all', 'Vinjari zote')} {root.name} →
        </Link>
      </div>
    </div>
  );
}
