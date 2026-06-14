'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Users, ShieldCheck, Activity, Phone, Home, Store, Bike, Trash2, Star, Megaphone, Plus, TrendingUp, Banknote, Check, X, Flag } from 'lucide-react';
import { adminApi, JikoUser } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { localPhone, timeAgo } from '../../lib/utils';
import { AppHeader } from '../AppHeader';
import { Card, Spinner, Money, Stat, Badge, Button, cn } from '../ui';

const ROLE_ICON: Record<string, any> = { HOUSEHOLD: Home, SUPPLIER: Store, RIDER: Bike, ADMIN: ShieldCheck };

export function AdminHome({ user }: { user: JikoUser }) {
  const { t } = useT();
  const [tab, setTab]     = useState<'overview' | 'users' | 'flow' | 'growth'>('overview');
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [kycList, setKyc] = useState<any[]>([]);
  const [zoom, setZoom]   = useState<string | null>(null);
  const [sups, setSups]   = useState<any[]>([]);
  const [adList, setAdList] = useState<any[]>([]);
  const [adForm, setAdForm] = useState({ brand: '', title: '', subtitle: '', ctaLabel: '', region: '', type: '', weight: '1' });
  const [adBusy, setAdBusy] = useState(false);
  const [cashouts, setCashouts] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);

  async function load() {
    const [s, u, o, k, sp, ad, co, dp] = await Promise.all([
      adminApi.stats().catch(() => null), adminApi.users().catch(() => ({ users: [] })),
      adminApi.orders().catch(() => ({ orders: [] })), adminApi.kycPending().catch(() => ({ pending: [] })),
      adminApi.suppliers().catch(() => ({ suppliers: [] })), adminApi.ads().catch(() => ({ ads: [] })),
      adminApi.cashouts().catch(() => ({ requests: [] })), adminApi.disputes().catch(() => ({ disputes: [] })),
    ]);
    setStats(s); setUsers(u.users ?? []); setOrders(o.orders ?? []); setKyc(k.pending ?? []);
    setSups(sp.suppliers ?? []); setAdList(ad.ads ?? []); setCashouts(co.requests ?? []); setDisputes(dp.disputes ?? []);
  }
  useEffect(() => { load(); }, []);

  async function resolveDispute(id: string, status: 'RESOLVED' | 'REJECTED') {
    try { await adminApi.resolveDispute(id, status); toast.success(status === 'RESOLVED' ? t('Resolved', 'Imetatuliwa') : t('Rejected', 'Imekataliwa')); load(); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); }
  }

  async function payCashout(id: string) { try { await adminApi.payCashout(id); toast.success(t('Marked paid', 'Imelipwa')); load(); } catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } }
  async function rejectCashout(id: string) { try { await adminApi.rejectCashout(id); toast(t('Refunded to wallet', 'Imerejeshwa')); load(); } catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } }

  async function setTier(id: string, tier: string) {
    setSups((arr) => arr.map((s) => s.id === id ? { ...s, tier } : s));
    try { await adminApi.setTier(id, { tier: tier as any }); } catch { toast.error(t('Failed', 'Imeshindikana')); load(); }
  }
  async function toggleFeatured(s: any) {
    const featured = !s.featured;
    setSups((arr) => arr.map((x) => x.id === s.id ? { ...x, featured } : x));
    try { await adminApi.setTier(s.id, { featured }); } catch { toast.error(t('Failed', 'Imeshindikana')); load(); }
  }
  async function createAd() {
    if (!adForm.brand.trim() || !adForm.title.trim()) return toast.error(t('Brand and title are required', 'Brand na kichwa vinahitajika'));
    setAdBusy(true);
    try {
      await adminApi.createAd({ brand: adForm.brand.trim(), title: adForm.title.trim(), subtitle: adForm.subtitle || undefined, ctaLabel: adForm.ctaLabel || undefined, region: adForm.region || undefined, type: adForm.type || undefined, weight: Number(adForm.weight) || 1 });
      toast.success(t('Ad published', 'Tangazo limewekwa'));
      setAdForm({ brand: '', title: '', subtitle: '', ctaLabel: '', region: '', type: '', weight: '1' });
      load();
    } catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setAdBusy(false); }
  }
  async function toggleAd(a: any) { try { await adminApi.patchAd(a.id, { isActive: !a.isActive }); load(); } catch { toast.error(t('Failed', 'Imeshindikana')); } }
  async function delAd(id: string) { try { await adminApi.deleteAd(id); load(); } catch { toast.error(t('Failed', 'Imeshindikana')); } }

  async function decide(id: string, status: 'APPROVED' | 'REJECTED') {
    try { await adminApi.kyc(id, status); toast.success(status === 'APPROVED' ? t('Approved', 'Imethibitishwa') : t('Rejected', 'Imekataliwa')); load(); }
    catch { toast.error(t('Failed', 'Imeshindikana')); }
  }
  async function delUser(id: string) {
    if (!confirm(t('Delete this user and all their data?', 'Futa mtumiaji huyu na data zote?'))) return;
    try { await adminApi.deleteUser(id); toast.success(t('User deleted', 'Mtumiaji amefutwa')); load(); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); }
  }

  if (!stats) return <Spinner />;

  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => (
    <button onClick={() => setTab(id)} className={cn('flex-1 rounded-xl py-2 text-xs font-semibold transition', tab === id ? 'bg-grad-brand text-white' : 'bg-black/5 text-ink/60')}>{label}</button>
  );
  const inputCls = 'w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-flame';

  return (
    <div className="min-h-screen pb-10">
      <AppHeader title={t('JIKO Admin', 'JIKO Admin')} subtitle={t('Network control', 'Usimamizi wa mtandao')} />
      {zoom && <div onClick={() => setZoom(null)} className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6"><img src={zoom} alt="" className="max-h-full max-w-full rounded-xl" /></div>}

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        <div className="flex gap-2">
          <TabBtn id="overview" label={t('Overview', 'Muhtasari')} />
          <TabBtn id="users" label={`${t('Users', 'Watumiaji')} (${users.length})`} />
          <TabBtn id="flow" label={`${t('Flow', 'Mtiririko')} (${orders.length})`} />
          <TabBtn id="growth" label={t('Grow', 'Kuza')} />
        </div>

        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <Stat label={t('GMV', 'GMV')} value={<Money value={stats.gmv} className="text-base" />} accent />
              <Stat label={t('Platform revenue', 'Mapato ya jukwaa')} value={<Money value={stats.platformRevenue} className="text-base" />} />
              <Stat label={t('Total orders', 'Oda zote')} value={stats.orders.total} />
              <Stat label={t('Delivered', 'Zimefika')} value={stats.orders.delivered} />
            </div>
            {stats.revenueBreakdown && (
              <Card className="!p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink/60"><TrendingUp size={14} className="text-leaf" /> {t('Revenue streams', 'Vyanzo vya mapato')}</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><Money value={stats.revenueBreakdown.commission} className="text-sm" /><div className="text-[10px] text-ink/50">{t('Commission', 'Komisheni')}</div></div>
                  <div><Money value={stats.revenueBreakdown.serviceFee} className="text-sm" /><div className="text-[10px] text-ink/50">{t('Service fees', 'Ada za huduma')}</div></div>
                  <div><Money value={stats.revenueBreakdown.deliveryMargin} className="text-sm" /><div className="text-[10px] text-ink/50">{t('Delivery margin', 'Faida ya usafiri')}</div></div>
                </div>
              </Card>
            )}
            {stats.trend && (
              <Card>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink/60"><Activity size={14} className="text-flame" /> {t('Orders — last 7 days', 'Oda — siku 7 zilizopita')}</div>
                <div className="flex h-24 items-end justify-between gap-1.5">
                  {stats.trend.map((d: any, i: number) => {
                    const max = Math.max(...stats.trend.map((x: any) => x.count), 1);
                    return (
                      <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                        <span className="text-[10px] font-bold tabular-nums">{d.count}</span>
                        <div className="w-full rounded-t bg-grad-brand" style={{ height: `${Math.max(4, (d.count / max) * 70)}px` }} />
                        <span className="text-[9px] text-ink/40">{d.label}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
            {stats.topVendors?.length > 0 && (
              <Card className="!p-3">
                <div className="mb-1.5 text-xs font-bold text-ink/60">{t('Top vendors', 'Wauzaji bora')}</div>
                {stats.topVendors.map((v: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-1 text-sm"><span className="min-w-0 truncate">{i + 1}. {v.name}</span><span className="flex-shrink-0 font-bold tabular-nums">{v.count}</span></div>
                ))}
              </Card>
            )}
            <Card>
              <div className="mb-3 flex items-center gap-2 font-bold"><Users size={18} className="text-flame" /> {t('Users', 'Watumiaji')}</div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div><div className="text-xl font-extrabold">{stats.users.households}</div><div className="text-xs text-ink/50">{t('Households', 'Kaya')}</div></div>
                <div><div className="text-xl font-extrabold">{stats.users.suppliers}</div><div className="text-xs text-ink/50">{t('Suppliers', 'Wauzaji')}</div></div>
                <div><div className="text-xl font-extrabold">{stats.users.riders}</div><div className="text-xs text-ink/50">{t('Riders', 'Madereva')}</div></div>
              </div>
            </Card>
            <div>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><ShieldCheck size={15} /> {t('KYC submissions to review', 'Uthibitisho wa kukagua')} ({kycList.length})</h2>
              {kycList.length === 0 ? <p className="py-4 text-center text-sm text-ink/50">{t('No KYC pending.', 'Hakuna KYC inayosubiri.')}</p> :
                <div className="space-y-3">
                  {kycList.map((u) => (
                    <Card key={u.id}>
                      <div className="flex items-center justify-between">
                        <div><div className="font-semibold">{u.kycName ?? u.name}</div><div className="text-xs text-ink/50">{u.role} · {localPhone(u.phone)} · {u.region ?? '—'}</div></div>
                        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold text-ink/60">{u.kycIdType} {u.kycIdNumber}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {u.kycSelfieUrl && <button onClick={() => setZoom(u.kycSelfieUrl)}><img src={u.kycSelfieUrl} alt="selfie" className="h-28 w-full rounded-xl object-cover" /><span className="text-[10px] text-ink/50">{t('Selfie', 'Picha ya uso')}</span></button>}
                        {u.kycIdUrl && <button onClick={() => setZoom(u.kycIdUrl)}><img src={u.kycIdUrl} alt="id" className="h-28 w-full rounded-xl object-cover" /><span className="text-[10px] text-ink/50">{t('ID', 'Kitambulisho')}</span></button>}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button variant="ghost" className="flex-1 !text-sm" onClick={() => decide(u.id, 'REJECTED')}>{t('Reject', 'Kataa')}</Button>
                        <Button variant="leaf" className="flex-1 !text-sm" onClick={() => decide(u.id, 'APPROVED')}>{t('Approve & verify', 'Kubali & thibitisha')}</Button>
                      </div>
                    </Card>
                  ))}
                </div>
              }
            </div>
          </>
        )}

        {tab === 'users' && (
          <div className="space-y-2">
            <p className="text-xs text-ink/50">{t('Every registered user and their registration number.', 'Kila mtumiaji aliyesajili na namba yake.')}</p>
            {users.map((u) => {
              const Icon = ROLE_ICON[u.role] ?? Users;
              return (
                <Card key={u.id} className="flex items-center gap-3 !p-3">
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-flame/10 text-flame"><Icon size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{u.name ?? '—'}</div>
                    <div className="flex items-center gap-1 text-xs text-ink/50"><Phone size={11} /> {localPhone(u.phone)} · {u.region ?? '—'}</div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold text-ink/60">{u.role}</span>
                    <div className="mt-1 text-[10px] text-ink/40">{timeAgo(u.createdAt)}</div>
                  </div>
                  {u.role !== 'ADMIN' && <button onClick={() => delUser(u.id)} className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-danger"><Trash2 size={15} /></button>}
                </Card>
              );
            })}
          </div>
        )}

        {tab === 'flow' && (
          <div className="space-y-2">
            <p className="text-xs text-ink/50">{t('Full service flow — every order across households, suppliers and riders.', 'Mtiririko kamili — kila oda kati ya kaya, wauzaji na madereva.')}</p>
            {orders.length === 0 ? <p className="py-8 text-center text-sm text-ink/50">{t('No orders yet.', 'Hakuna oda bado.')}</p> :
              orders.map((o) => (
                <Card key={o.id} className="!p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{o.orderNo}</span>
                    <div className="flex items-center gap-2"><Money value={o.total} className="text-sm" /><Badge status={o.status} /></div>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-ink/60">
                    <div className="flex items-center gap-1.5"><Home size={12} className="text-flame" /> {o.household?.name ?? '—'} · {localPhone(o.household?.phone)}</div>
                    <div className="flex items-center gap-1.5"><Store size={12} className="text-flame" /> {o.supplier?.businessName ?? '—'} · {localPhone(o.supplier?.phone)}</div>
                    <div className="flex items-center gap-1.5"><Bike size={12} className="text-flame" /> {o.delivery?.rider?.name ? `${o.delivery.rider.name} · ${localPhone(o.delivery.rider.phone)}` : t('not assigned', 'hajapangwa')}</div>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-black/5 pt-2 text-[11px] text-ink/40">
                    <span>{t('Payment', 'Malipo')}: {o.payment?.status ?? '—'}</span>
                    <span>{timeAgo(o.placedAt)}</span>
                  </div>
                </Card>
              ))
            }
          </div>
        )}

        {tab === 'growth' && (
          <div className="space-y-5">
            {/* Cash-out disbursements (T1) */}
            <div>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Banknote size={15} /> {t('Cash-out requests', 'Maombi ya kutoa pesa')} ({cashouts.length})</h2>
              {cashouts.length === 0 ? <p className="py-3 text-center text-sm text-ink/50">{t('No pending cash-outs.', 'Hakuna maombi.')}</p> :
                <div className="space-y-2">
                  {cashouts.map((c) => (
                    <Card key={c.id} className="flex items-center gap-2 !p-3">
                      <div className="min-w-0 flex-1">
                        <Money value={c.amount} className="text-sm" />
                        <div className="truncate text-xs text-ink/50">{c.user?.name ?? '—'} · {c.user?.role} · {c.phone ?? localPhone(c.user?.phone)}</div>
                      </div>
                      <button onClick={() => rejectCashout(c.id)} className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-black/5 text-danger"><X size={16} /></button>
                      <Button variant="leaf" onClick={() => payCashout(c.id)} className="flex-shrink-0 !px-3"><Check size={16} /> {t('Paid', 'Lipa')}</Button>
                    </Card>
                  ))}
                </div>}
            </div>

            {/* Open disputes (Tier 2) */}
            <div>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Flag size={15} /> {t('Open disputes', 'Malalamiko')} ({disputes.length})</h2>
              {disputes.length === 0 ? <p className="py-3 text-center text-sm text-ink/50">{t('No open disputes.', 'Hakuna malalamiko.')}</p> :
                <div className="space-y-2">
                  {disputes.map((d) => (
                    <Card key={d.id} className="!p-3">
                      <div className="font-semibold">{d.reason}</div>
                      <div className="truncate text-xs text-ink/50">{d.order?.orderNo} · {d.order?.household?.name ?? '—'}{d.detail ? ` · ${d.detail}` : ''}</div>
                      <div className="mt-2 flex gap-2">
                        <Button variant="ghost" className="flex-1 !text-xs" onClick={() => resolveDispute(d.id, 'REJECTED')}>{t('Reject', 'Kataa')}</Button>
                        <Button variant="leaf" className="flex-1 !text-xs" onClick={() => resolveDispute(d.id, 'RESOLVED')}>{t('Resolve', 'Tatua')}</Button>
                      </div>
                    </Card>
                  ))}
                </div>}
            </div>

            {/* Supplier plans + featured slots (Phase 2) */}
            <div>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Star size={15} /> {t('Supplier plans & featured', 'Mipango ya wauzaji')}</h2>
              {sups.length === 0 ? <p className="py-4 text-center text-sm text-ink/50">{t('No suppliers yet.', 'Hakuna wauzaji bado.')}</p> :
                <div className="space-y-2">
                  {sups.map((s) => (
                    <Card key={s.id} className="!p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0"><div className="truncate font-semibold">{s.businessName}</div><div className="text-xs text-ink/50">{s.region} · {s._count?.orders ?? 0} {t('orders', 'oda')}</div></div>
                        <button onClick={() => toggleFeatured(s)} className={cn('flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold', s.featured ? 'bg-ember/15 text-ember' : 'bg-black/5 text-ink/40')}><Star size={12} className={s.featured ? 'fill-ember' : ''} /> {t('Featured', 'Featured')}</button>
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        {['FREE', 'STANDARD', 'PREMIUM'].map((tr) => (
                          <button key={tr} onClick={() => setTier(s.id, tr)} className={cn('flex-1 rounded-lg py-1.5 text-xs font-semibold', s.tier === tr ? 'bg-grad-brand text-white' : 'bg-black/5 text-ink/50')}>{tr === 'STANDARD' ? 'Pro' : tr === 'PREMIUM' ? 'Premium' : t('Free', 'Bure')}</button>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              }
            </div>

            {/* Sponsored brand ads (Phase 3) */}
            <div>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Megaphone size={15} /> {t('Sponsored brand ads', 'Matangazo ya brand')}</h2>
              <Card className="space-y-2 !p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input value={adForm.brand} onChange={(e) => setAdForm((f) => ({ ...f, brand: e.target.value }))} placeholder={t('Brand e.g. Oryx', 'Brand k.m. Oryx')} className={inputCls} />
                  <select value={adForm.type} onChange={(e) => setAdForm((f) => ({ ...f, type: e.target.value }))} className={inputCls}>
                    <option value="">{t('Any type', 'Aina yoyote')}</option>
                    <option value="REFILL">{t('Refill', 'Refill')}</option>
                    <option value="CYLINDER">{t('New cylinder', 'Mtungi mpya')}</option>
                    <option value="ACCESSORY">{t('Accessories', 'Vifaa')}</option>
                  </select>
                </div>
                <input value={adForm.title} onChange={(e) => setAdForm((f) => ({ ...f, title: e.target.value }))} placeholder={t('Headline', 'Kichwa')} className={inputCls} />
                <input value={adForm.subtitle} onChange={(e) => setAdForm((f) => ({ ...f, subtitle: e.target.value }))} placeholder={t('Subtitle (optional)', 'Maelezo (hiari)')} className={inputCls} />
                <div className="grid grid-cols-3 gap-2">
                  <input value={adForm.ctaLabel} onChange={(e) => setAdForm((f) => ({ ...f, ctaLabel: e.target.value }))} placeholder={t('Button', 'Kitufe')} className={inputCls} />
                  <input value={adForm.region} onChange={(e) => setAdForm((f) => ({ ...f, region: e.target.value }))} placeholder={t('Region/all', 'Mkoa/zote')} className={inputCls} />
                  <input value={adForm.weight} onChange={(e) => setAdForm((f) => ({ ...f, weight: e.target.value.replace(/\D/g, '') }))} placeholder={t('Weight', 'Uzito')} inputMode="numeric" className={inputCls} />
                </div>
                <Button variant="primary" loading={adBusy} onClick={createAd} className="w-full"><Plus size={15} /> {t('Publish ad', 'Weka tangazo')}</Button>
              </Card>
              {adList.length > 0 && (
                <div className="mt-2 space-y-2">
                  {adList.map((a) => (
                    <Card key={a.id} className="flex items-center gap-3 !p-3">
                      <div className="min-w-0 flex-1"><div className="truncate font-semibold">{a.brand} — {a.title}</div><div className="text-xs text-ink/50">{a.impressions} {t('views', 'mionekano')} · {a.clicks} {t('clicks', 'mibofyo')}{a.region ? ` · ${a.region}` : ''}</div></div>
                      <button onClick={() => toggleAd(a)} className={cn('flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold', a.isActive ? 'bg-leaf/15 text-leaf-dark' : 'bg-black/10 text-ink/40')}>{a.isActive ? t('Live', 'Hai') : t('Off', 'Imezimwa')}</button>
                      <button onClick={() => delAd(a.id)} className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-danger"><Trash2 size={15} /></button>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
