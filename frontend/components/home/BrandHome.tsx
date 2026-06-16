'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Megaphone, Plus, Pencil, Trash2, Image as ImageIcon, Inbox, BarChart3, Phone } from 'lucide-react';
import { brand, JikoUser } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { TZ_REGIONS } from '../../lib/tanzania';
import { localPhone, timeAgo } from '../../lib/utils';
import { AppHeader } from '../AppHeader';
import { RoleNav } from '../RoleNav';
import { Card, Button, Spinner, EmptyState, Stat, cn } from '../ui';

const ANIMS = ['none', 'pulse', 'shine', 'slide', 'float', 'zoom'];
const EMPTY = { id: '', title: '', subtitle: '', imageUrl: '', ctaLabel: '', linkUrl: '', bgColor: '', animation: 'none', region: '', type: '', weight: '1' };
type Tab = 'ads' | 'leads' | 'demand';

export function BrandHome({ user }: { user: JikoUser }) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('ads');
  const [me, setMe] = useState<{ profile: any; totals: any } | null>(null);
  const [ads, setAds] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [demand, setDemand] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const editing = !!form.id;

  async function load() {
    const [m, a, l, d] = await Promise.all([
      brand.me().catch(() => null), brand.ads().catch(() => ({ ads: [] })),
      brand.leads().catch(() => ({ leads: [] })), brand.demand().catch(() => null),
    ]);
    setMe(m as any); setAds((a as any).ads ?? []); setLeads((l as any).leads ?? []); setDemand(d);
  }
  useEffect(() => { load(); }, []);

  function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 2_000_000) return toast.error(t('Image too large (max 2MB)', 'Picha kubwa mno'));
    const rd = new FileReader(); rd.onload = () => setForm((s) => ({ ...s, imageUrl: String(rd.result) })); rd.readAsDataURL(f);
  }
  function editAd(a: any) {
    setForm({ id: a.id, title: a.title ?? '', subtitle: a.subtitle ?? '', imageUrl: a.imageUrl ?? '', ctaLabel: a.ctaLabel ?? '', linkUrl: a.linkUrl ?? '', bgColor: a.bgColor ?? '', animation: a.animation ?? 'none', region: a.region ?? '', type: a.type ?? '', weight: String(a.weight ?? 1) });
    setTab('ads'); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function save() {
    if (!form.title.trim()) return toast.error(t('Add a headline', 'Weka kichwa'));
    setBusy(true);
    const body = { title: form.title.trim(), subtitle: form.subtitle || undefined, imageUrl: form.imageUrl || undefined, ctaLabel: form.ctaLabel || undefined, linkUrl: form.linkUrl || undefined, bgColor: form.bgColor || undefined, animation: form.animation || 'none', region: form.region || undefined, type: form.type || undefined, weight: Number(form.weight) || 1 };
    try {
      if (editing) await brand.patchAd(form.id, body); else await brand.createAd(body);
      toast.success(t('Submitted — awaiting admin approval', 'Imewasilishwa — inasubiri idhini'));
      setForm({ ...EMPTY }); await load();
    } catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); }
  }
  async function del(id: string) { if (!confirm(t('Delete this campaign?', 'Futa tangazo?'))) return; try { await brand.deleteAd(id); if (form.id === id) setForm({ ...EMPTY }); await load(); } catch { toast.error(t('Failed', 'Imeshindikana')); } }

  if (!me) return <Spinner />;
  const inputCls = 'w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-flame';
  const animClass = form.animation === 'pulse' ? 'ad-anim-pulse' : form.animation === 'float' ? 'ad-anim-float' : form.animation === 'zoom' ? 'ad-anim-zoom' : '';
  const ctr = me.totals.impressions > 0 ? ((me.totals.clicks / me.totals.impressions) * 100).toFixed(1) : '0.0';
  const maxUnits = Math.max(1, ...(demand?.regions ?? []).map((r: any) => r.units));
  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button onClick={() => setTab(id)} className={cn('flex-1 rounded-xl py-2 text-xs font-semibold transition', tab === id ? 'bg-grad-brand text-white' : 'bg-black/5 text-ink/60')}>{label}</button>
  );

  return (
    <div className="min-h-screen pb-24">
      <AppHeader title={me.profile?.brandName ?? t('Brand', 'Kampuni')} subtitle={t('Advertiser portal', 'Mlango wa matangazo')} />

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        <div className="grid grid-cols-4 gap-2">
          <Stat label={t('Ads', 'Matangazo')} value={me.totals.ads} />
          <Stat label={t('Views', 'Mionekano')} value={me.totals.impressions} />
          <Stat label={t('Clicks', 'Mibofyo')} value={me.totals.clicks} />
          <Stat label={t('Leads', 'Maombi')} value={me.totals.leads} accent />
        </div>

        <div className="flex gap-2">
          <TabBtn id="ads" label={t('Campaigns', 'Matangazo')} />
          <TabBtn id="leads" label={`${t('Leads', 'Maombi')} (${leads.length})`} />
          <TabBtn id="demand" label={t('Demand', 'Mahitaji')} />
        </div>

        {tab === 'ads' && (
          <>
            {/* Live preview */}
            <div className={cn('relative overflow-hidden rounded-2xl shadow-ds-card', !form.bgColor && 'bg-grad-brand', animClass, form.animation === 'shine' && 'ad-shine')} style={form.bgColor ? { backgroundColor: form.bgColor } : undefined}>
              <div className="flex items-center gap-3 p-3.5 text-white">
                {form.imageUrl ? <img src={form.imageUrl} alt="" className="h-14 w-14 flex-shrink-0 rounded-xl object-cover" /> : <span className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-xl bg-white/15 text-lg font-extrabold">{(me.profile?.brandName ?? 'AD').slice(0, 2).toUpperCase()}</span>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-extrabold leading-tight">{form.title || t('Your headline', 'Kichwa chako')}</div>
                  {form.subtitle && <div className="truncate text-xs text-white/85">{form.subtitle}</div>}
                  <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/85">{me.profile?.brandName}</div>
                </div>
                <span className="flex-shrink-0 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-flame">{form.ctaLabel || t('Shop now', 'Nunua sasa')}</span>
              </div>
              <span className="absolute right-2 top-2 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">{t('Sponsored', 'Tangazo')}</span>
            </div>

            <Card className="space-y-2 !p-3">
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t('Headline', 'Kichwa')} className={inputCls} />
              <input value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} placeholder={t('Subtitle (optional)', 'Maelezo (hiari)')} className={inputCls} />
              <div className="grid grid-cols-2 gap-2">
                <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/20 bg-black/[.02] px-3 py-2 text-sm font-semibold text-ink/60"><ImageIcon size={15} /> {form.imageUrl ? t('Change image', 'Badili') : t('Add image', 'Weka picha')}<input type="file" accept="image/*" onChange={onImage} className="hidden" /></label>
                <input value={form.ctaLabel} onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))} placeholder={t('Button text', 'Kitufe')} className={inputCls} />
              </div>
              <input value={form.linkUrl} onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))} placeholder={t('Link URL (optional)', 'Kiungo (hiari)')} className={inputCls} />
              <div className="grid grid-cols-2 gap-2">
                <select value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} className={inputCls}>
                  <option value="">{t('All regions', 'Mikoa yote')}</option>
                  {TZ_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <select value={form.animation} onChange={(e) => setForm((f) => ({ ...f, animation: e.target.value }))} className={inputCls}>
                  {ANIMS.map((a) => <option key={a} value={a}>{t('Motion', 'Mwendo')}: {a}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-1.5 rounded-xl border border-black/15 bg-white px-2 py-1.5 text-xs text-ink/60">{t('Colour', 'Rangi')}<input type="color" value={form.bgColor || '#F15A24'} onChange={(e) => setForm((f) => ({ ...f, bgColor: e.target.value }))} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />{form.bgColor && <button type="button" onClick={() => setForm((f) => ({ ...f, bgColor: '' }))} className="text-[10px] text-ink/40 underline">{t('clear', 'futa')}</button>}</label>
                <input value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" placeholder={t('Priority (1-100)', 'Kipaumbele')} className={inputCls} />
              </div>
              <div className="flex gap-2 pt-1">
                {editing && <Button variant="ghost" onClick={() => setForm({ ...EMPTY })} className="flex-shrink-0">{t('Cancel', 'Ghairi')}</Button>}
                <Button variant="primary" loading={busy} onClick={save} className="flex-1">{editing ? <><Pencil size={15} /> {t('Save (re-submit)', 'Hifadhi')}</> : <><Plus size={15} /> {t('Submit campaign', 'Wasilisha tangazo')}</>}</Button>
              </div>
              <p className="text-center text-[11px] text-ink/40">{t('Campaigns go live after admin approval.', 'Matangazo huanza baada ya idhini.')}</p>
            </Card>

            <div>
              <h2 className="mb-2 text-sm font-bold text-ink/70">{t('My campaigns', 'Matangazo yangu')} ({ads.length})</h2>
              {ads.length === 0 ? <EmptyState icon={<Megaphone size={34} />} title={t('No campaigns yet', 'Hakuna matangazo')} sub={t('Create your first above.', 'Tengeneza la kwanza juu.')} /> :
                <div className="space-y-2">
                  {ads.map((a) => {
                    const c = a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(1) : '0.0';
                    const pill = a.status === 'APPROVED' ? (a.isActive ? 'bg-leaf/15 text-leaf-dark' : 'bg-black/10 text-ink/40') : a.status === 'REJECTED' ? 'bg-danger/10 text-danger' : 'bg-warning/15 text-warning';
                    const pillTxt = a.status === 'APPROVED' ? (a.isActive ? t('Live', 'Hai') : t('Paused', 'Imesimama')) : a.status === 'REJECTED' ? t('Rejected', 'Imekataliwa') : t('Pending', 'Inasubiri');
                    return (
                      <Card key={a.id} className="!p-3">
                        <div className="flex items-center gap-3">
                          {a.imageUrl ? <img src={a.imageUrl} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg object-cover" /> : <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-flame/10 text-xs font-bold text-flame">{(me.profile?.brandName ?? 'AD').slice(0, 2).toUpperCase()}</span>}
                          <div className="min-w-0 flex-1"><div className="truncate font-semibold">{a.title}</div><div className="truncate text-xs text-ink/50">{a.region || t('All TZ', 'TZ nzima')} · {a.animation}</div></div>
                          <span className={cn('flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold', pill)}>{pillTxt}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 border-t border-black/5 pt-2 text-[11px] text-ink/50">
                          <span className="min-w-0 truncate">{a.impressions} {t('views', 'mionekano')} · {a.clicks} {t('clicks', 'mibofyo')} · {a.leads ?? 0} {t('leads', 'maombi')} · {c}% CTR</span>
                          <div className="flex flex-shrink-0 gap-1">
                            <button onClick={() => editAd(a)} className="grid h-7 w-7 place-items-center rounded-lg bg-black/5 text-ink/60"><Pencil size={14} /></button>
                            <button onClick={() => del(a.id)} className="grid h-7 w-7 place-items-center rounded-lg text-danger"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>}
            </div>
          </>
        )}

        {tab === 'leads' && (
          <div>
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Inbox size={15} className="text-flame" /> {t('Customer enquiries', 'Maombi ya wateja')} ({leads.length})</h2>
            {leads.length === 0 ? <EmptyState icon={<Inbox size={34} />} title={t('No enquiries yet', 'Hakuna maombi')} sub={t('When people tap Shop now, they appear here.', 'Watakaobofya Nunua wataonekana hapa.')} /> :
              <div className="space-y-2">
                {leads.map((l) => (
                  <Card key={l.id} className="!p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{l.name} <span className="text-xs font-normal text-ink/50">· {l.ad?.title}</span></div>
                        {l.note && <div className="mt-0.5 text-xs text-ink/60">“{l.note}”</div>}
                        <div className="mt-0.5 text-[10px] text-ink/40">{l.region ? `${l.region} · ` : ''}{timeAgo(l.createdAt)}</div>
                      </div>
                    </div>
                    <a href={`tel:${l.phone}`} className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-flame/10 py-2 text-xs font-bold text-flame"><Phone size={13} /> {localPhone(l.phone)}</a>
                  </Card>
                ))}
              </div>}
          </div>
        )}

        {tab === 'demand' && (
          <div>
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><BarChart3 size={15} className="text-leaf" /> {t('Demand by region', 'Mahitaji kwa mkoa')}</h2>
            <Card className="!p-3">
              <div className="mb-3 flex items-center justify-around text-center">
                <div><div className="text-2xl font-extrabold">{demand?.totalUnits ?? 0}</div><div className="text-[10px] text-ink/50">{t('units (90 days)', 'vipimo (siku 90)')}</div></div>
                <div><div className="text-2xl font-extrabold">{demand?.orders ?? 0}</div><div className="text-[10px] text-ink/50">{t('order lines', 'oda')}</div></div>
              </div>
              {(!demand?.regions || demand.regions.length === 0) ? <p className="py-3 text-center text-sm text-ink/50">{t('No sales of your brand yet.', 'Hakuna mauzo bado.')}</p> :
                <div className="space-y-2 border-t border-black/5 pt-3">
                  {demand.regions.map((r: any) => (
                    <div key={r.region}>
                      <div className="mb-0.5 flex items-center justify-between text-xs"><span className="font-semibold">{r.region}</span><span className="text-ink/50">{r.units}</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-grad-brand" style={{ width: `${(r.units / maxUnits) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>}
            </Card>
            <p className="mt-2 text-center text-[11px] text-ink/40">{t('Where households are buying your brand — target your ads here.', 'Pale kaya zinanunua brand yako — lenga matangazo hapa.')}</p>
          </div>
        )}
      </div>
      <RoleNav role="BRAND" />
    </div>
  );
}
