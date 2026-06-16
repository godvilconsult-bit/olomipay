'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ads, type BrandAd } from '../lib/api';
import { useT } from '../lib/i18n';
import { cn } from './ui';

// Light vs dark background → readable text colour (brands pick their own bgColor).
function isLight(hex?: string | null): boolean {
  if (!hex) return false;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72;
}

/**
 * Region-targeted sponsored ads (the revenue surface). Rotates through the live
 * ads for the selected region, each with the brand's chosen motion (pulse, shine,
 * float, zoom, slide). Reports an impression the first time each ad is shown and a
 * click on tap; taps either open the brand's link or filter vendors by the brand.
 */
export function SponsoredAds({ region, onBrand, className }: { region?: string; onBrand?: (brand: string, type?: string) => void; className?: string }) {
  const { t } = useT();
  const [list, setList] = useState<BrandAd[]>([]);
  const [idx, setIdx]   = useState(0);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    ads.active(region).then((r) => { if (alive) { setList(r.ads ?? []); setIdx(0); } }).catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [region]);

  // Auto-rotate through the region's ads.
  useEffect(() => {
    if (list.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % list.length), 5200);
    return () => clearInterval(id);
  }, [list.length]);

  const ad = list[idx];

  // Count one impression per ad per mount.
  useEffect(() => {
    if (!ad || seen.current.has(ad.id)) return;
    seen.current.add(ad.id);
    ads.impression(ad.id).catch(() => {});
  }, [ad?.id]);

  if (!ad) return null;

  function open() {
    ads.click(ad.id).catch(() => {});
    if (ad.linkUrl) { window.open(ad.linkUrl, '_blank', 'noopener'); return; }
    onBrand?.(ad.brand, ad.type || undefined);
    toast.success(t(`Showing ${ad.brand}`, `Inaonyesha ${ad.brand}`));
  }

  const light = isLight(ad.bgColor);
  const animClass = ad.animation === 'pulse' ? 'ad-anim-pulse' : ad.animation === 'float' ? 'ad-anim-float' : ad.animation === 'zoom' ? 'ad-anim-zoom' : '';
  const fg = light ? 'text-ink' : 'text-white';
  const sub = light ? 'text-ink/60' : 'text-white/85';

  return (
    <div className={className}>
      <button onClick={open} className={cn('relative block w-full overflow-hidden rounded-2xl text-left shadow-ds-card transition active:scale-[.99]', !ad.bgColor && 'bg-grad-brand', animClass, ad.animation === 'shine' && 'ad-shine')} style={ad.bgColor ? { backgroundColor: ad.bgColor } : undefined}>
        <div key={ad.id} className="ad-enter flex items-center gap-3 p-3.5">
          {ad.imageUrl
            ? <img src={ad.imageUrl} alt={ad.brand} className="h-14 w-14 flex-shrink-0 rounded-xl object-cover" />
            : <span className={cn('grid h-14 w-14 flex-shrink-0 place-items-center rounded-xl text-lg font-extrabold', light ? 'bg-black/10' : 'bg-white/15', fg)}>{ad.brand.slice(0, 2).toUpperCase()}</span>}
          <div className="min-w-0 flex-1">
            <div className={cn('truncate text-[15px] font-extrabold leading-tight', fg)}>{ad.title}</div>
            {ad.subtitle && <div className={cn('truncate text-xs', sub)}>{ad.subtitle}</div>}
            <div className={cn('mt-0.5 text-[10px] font-semibold uppercase tracking-wide', sub)}>{ad.brand}</div>
          </div>
          <span className={cn('flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold', light ? 'bg-ink text-white' : 'bg-white text-flame')}>{ad.ctaLabel || t('Shop', 'Nunua')}</span>
        </div>
        <span className={cn('absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide', light ? 'bg-black/10 text-ink/60' : 'bg-white/20 text-white')}>{t('Sponsored', 'Tangazo')}</span>
      </button>

      {list.length > 1 && (
        <div className="mt-1.5 flex items-center justify-center gap-1.5">
          {list.map((a, i) => (
            <button key={a.id} onClick={() => setIdx(i)} aria-label={`Ad ${i + 1}`} className={cn('h-1.5 rounded-full transition-all', i === idx ? 'w-4 bg-flame' : 'w-1.5 bg-ink/20')} />
          ))}
        </div>
      )}
    </div>
  );
}
