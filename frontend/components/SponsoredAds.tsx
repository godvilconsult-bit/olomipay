'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { X, Send } from 'lucide-react';
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

function AdCard({ ad }: { ad: BrandAd }) {
  const { t } = useT();
  const light = isLight(ad.bgColor);
  const animClass = ad.animation === 'pulse' ? 'ad-anim-pulse' : ad.animation === 'float' ? 'ad-anim-float' : ad.animation === 'zoom' ? 'ad-anim-zoom' : '';
  const fg = light ? 'text-ink' : 'text-white';
  const sub = light ? 'text-ink/60' : 'text-white/85';
  return (
    <div className={cn('relative h-full overflow-hidden rounded-2xl shadow-ds-card', !ad.bgColor && 'bg-grad-brand', animClass, ad.animation === 'shine' && 'ad-shine')} style={ad.bgColor ? { backgroundColor: ad.bgColor } : undefined}>
      <div className="flex items-center gap-3 p-3.5">
        {ad.imageUrl
          ? <img src={ad.imageUrl} alt={ad.brand} className="h-14 w-14 flex-shrink-0 rounded-xl object-cover" />
          : <span className={cn('grid h-14 w-14 flex-shrink-0 place-items-center rounded-xl text-lg font-extrabold', light ? 'bg-black/10' : 'bg-white/15', fg)}>{ad.brand.slice(0, 2).toUpperCase()}</span>}
        <div className="min-w-0 flex-1">
          <div className={cn('truncate text-[15px] font-extrabold leading-tight', fg)}>{ad.title}</div>
          {ad.subtitle && <div className={cn('truncate text-xs', sub)}>{ad.subtitle}</div>}
          <div className={cn('mt-0.5 text-[10px] font-semibold uppercase tracking-wide', sub)}>{ad.brand}</div>
        </div>
        <span className={cn('flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold', light ? 'bg-ink text-white' : 'bg-white text-flame')}>{ad.ctaLabel || t('Shop now', 'Nunua sasa')}</span>
      </div>
      <span className={cn('absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide', light ? 'bg-black/10 text-ink/60' : 'bg-white/20 text-white')}>{t('Sponsored', 'Tangazo')}</span>
    </div>
  );
}

/**
 * Region-targeted sponsored ads (the revenue surface). A seamless carousel that
 * auto-slides every 3s through ALL live ads for the selected region, each with the
 * brand's chosen motion. Tapping "Shop now" opens a quick details form so the
 * advertiser/distributor can follow up (unless the ad has its own link).
 */
export function SponsoredAds({ region, userName, userPhone, className }: { region?: string; userName?: string | null; userPhone?: string | null; className?: string }) {
  const { t } = useT();
  const [list, setList] = useState<BrandAd[]>([]);
  const [idx, setIdx]   = useState(0);
  const [withAnim, setWithAnim] = useState(true);
  const seen = useRef<Set<string>>(new Set());

  // Lead form
  const [leadAd, setLeadAd] = useState<BrandAd | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', note: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    ads.active(region).then((r) => { if (alive) { setList(r.ads ?? []); setIdx(0); setWithAnim(true); } }).catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [region]);

  // Auto-advance every 3 seconds.
  useEffect(() => {
    if (list.length < 2) return;
    const id = setInterval(() => setIdx((i) => i + 1), 3000);
    return () => clearInterval(id);
  }, [list.length]);

  // After sliding onto the cloned first slide, snap back to 0 with no animation → seamless loop.
  useEffect(() => {
    if (!withAnim) {
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setWithAnim(true)));
      return () => cancelAnimationFrame(r);
    }
  }, [withAnim]);

  const realIdx = list.length ? idx % list.length : 0;
  const current = list[realIdx];

  // One impression per ad per mount, as it becomes the visible slide.
  useEffect(() => {
    if (!current || seen.current.has(current.id)) return;
    seen.current.add(current.id);
    ads.impression(current.id).catch(() => {});
  }, [current?.id]);

  if (!current) return null;

  const slides = list.length > 1 ? [...list, list[0]] : list;

  function tap(ad: BrandAd) {
    ads.click(ad.id).catch(() => {});
    if (ad.linkUrl) { window.open(ad.linkUrl, '_blank', 'noopener'); return; }
    setForm({ name: userName ?? '', phone: userPhone ?? '', note: '' });
    setLeadAd(ad);
  }

  async function submitLead() {
    if (!leadAd) return;
    if (!form.name.trim() || form.phone.replace(/\D/g, '').length < 7) return toast.error(t('Enter your name and phone', 'Weka jina na namba yako'));
    setBusy(true);
    try {
      await ads.lead(leadAd.id, { name: form.name.trim(), phone: form.phone.trim(), note: form.note.trim() || undefined });
      toast.success(t(`Thanks! ${leadAd.brand} will contact you soon`, `Asante! ${leadAd.brand} watawasiliana nawe`));
      setLeadAd(null);
    } catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); }
  }

  return (
    <div className={className}>
      {/* Sliding track */}
      <div className="overflow-hidden">
        <div
          className="flex"
          style={{ transform: `translateX(-${idx * 100}%)`, transition: withAnim ? 'transform .6s cubic-bezier(.22,1,.36,1)' : 'none' }}
          onTransitionEnd={() => { if (list.length > 1 && idx === list.length) { setWithAnim(false); setIdx(0); } }}
        >
          {slides.map((ad, i) => (
            <button key={`${ad.id}-${i}`} type="button" onClick={() => tap(ad)} className="w-full flex-shrink-0 px-0.5 text-left active:scale-[.99]">
              <AdCard ad={ad} />
            </button>
          ))}
        </div>
      </div>

      {/* Dots */}
      {list.length > 1 && (
        <div className="mt-1.5 flex items-center justify-center gap-1.5">
          {list.map((a, i) => (
            <button key={a.id} onClick={() => { setWithAnim(true); setIdx(i); }} aria-label={`Ad ${i + 1}`} className={cn('h-1.5 rounded-full transition-all', i === realIdx ? 'w-4 bg-flame' : 'w-1.5 bg-ink/20')} />
          ))}
        </div>
      )}

      {/* "Shop now" lead form */}
      {leadAd && (
        <div className="fixed inset-0 z-[90] grid place-items-end bg-black/55 backdrop-blur-sm sm:place-items-center" onClick={() => !busy && setLeadAd(null)}>
          <div className="w-full max-w-md animate-[fadeUp_.25s_ease-out] rounded-t-3xl bg-white p-5 shadow-2xl dark:bg-ink-2 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                {leadAd.imageUrl ? <img src={leadAd.imageUrl} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-flame/15 font-bold text-flame">{leadAd.brand.slice(0, 2).toUpperCase()}</span>}
                <div><div className="font-extrabold leading-tight">{leadAd.brand}</div><div className="text-xs text-ink/50">{t('Leave your details — they’ll reach out', 'Acha namba — watawasiliana nawe')}</div></div>
              </div>
              <button onClick={() => setLeadAd(null)} className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-black/5 text-ink/50"><X size={16} /></button>
            </div>
            <div className="space-y-2.5">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('Your name', 'Jina lako')} className="w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-flame dark:bg-white/5 dark:text-sand" />
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/[^\d+]/g, '') }))} inputMode="tel" placeholder={t('Phone number', 'Namba ya simu')} className="w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-flame dark:bg-white/5 dark:text-sand" />
              <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={2} placeholder={t('What do you need? (size, quantity…)', 'Unahitaji nini? (saizi, idadi…)')} className="w-full resize-none rounded-2xl border border-black/15 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-flame dark:bg-white/5 dark:text-sand" />
              <button onClick={submitLead} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-grad-brand py-3.5 text-base font-bold text-white shadow-ds-btn transition active:scale-[.99] disabled:opacity-60">
                <Send size={17} /> {busy ? t('Sending…', 'Inatuma…') : t('Send my details', 'Tuma namba yangu')}
              </button>
              <p className="text-center text-[11px] text-ink/40">{t('The distributor will contact you to complete your order.', 'Msambazaji atawasiliana nawe kukamilisha oda.')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
