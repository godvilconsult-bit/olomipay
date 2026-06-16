'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Truck, Store, Plus, Minus, Check, BadgeCheck, Package } from 'lucide-react';
import { distributors } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { Card, Button, Spinner, Money, EmptyState, cn } from '../../../components/ui';
import { RoleNav } from '../../../components/RoleNav';

const STATUS: Record<string, [string, string, string]> = {
  PLACED:     ['Sent', 'Imetumwa', 'bg-flame/15 text-flame'],
  ACCEPTED:   ['Accepted', 'Imekubaliwa', 'bg-blue/15 text-blue-700'],
  DISPATCHED: ['On the way', 'Njiani', 'bg-ember/15 text-ember'],
  RECEIVED:   ['Received', 'Imepokelewa', 'bg-leaf/15 text-leaf-dark'],
  CANCELLED:  ['Declined', 'Imekataliwa', 'bg-black/10 text-ink/40'],
};

export default function SupplierRestock() {
  const router = useRouter();
  const { t } = useT();
  const [dists, setDists] = useState<any[] | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [picked, setPicked] = useState<any | null>(null); // { distributor, stock }
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  async function loadLists() {
    const [d, o] = await Promise.all([distributors.search().catch(() => ({ distributors: [] })), distributors.myOrders().catch(() => ({ orders: [] }))]);
    setDists(d.distributors ?? []); setOrders(o.orders ?? []);
  }
  useEffect(() => { loadLists(); }, []);

  async function open(id: string) { try { const r = await distributors.get(id); setPicked(r); setCart({}); window.scrollTo({ top: 0 }); } catch { toast.error(t('Failed', 'Imeshindikana')); } }
  const setQty = (pid: string, q: number) => setCart((c) => { const n = { ...c }; if (q <= 0) delete n[pid]; else n[pid] = q; return n; });
  const lines = picked ? picked.stock.filter((s: any) => cart[s.productId] > 0).map((s: any) => ({ productId: s.productId, qty: cart[s.productId], price: s.price })) : [];
  const total = lines.reduce((sum: number, l: any) => sum + l.qty * l.price, 0);

  async function place() {
    if (lines.length === 0) return toast.error(t('Add at least one item', 'Ongeza angalau bidhaa moja'));
    setBusy(true);
    try { await distributors.restock({ distributorId: picked.distributor.id, items: lines.map((l: any) => ({ productId: l.productId, qty: l.qty })) }); toast.success(t('Restock order sent to distributor', 'Oda imetumwa kwa msambazaji')); setPicked(null); setCart({}); await loadLists(); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); }
  }
  async function received(id: string) {
    setBusy(true);
    try { await distributors.received(id); toast.success(t('Received — your shop stock was topped up ✅', 'Imepokelewa — bidhaa zimeongezwa ✅')); await loadLists(); }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); }
  }

  if (dists === null) return <div className="min-h-screen bg-sand"><Spinner /></div>;
  const label = (p: any) => `${p.brand} ${p.name}${p.sizeKg ? ` (${p.sizeKg}kg)` : ''}`;

  // ── Distributor catalog (ordering) view ──
  if (picked) {
    return (
      <div className="min-h-screen bg-sand pb-40">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/85 px-4 py-3 backdrop-blur">
          <button onClick={() => setPicked(null)} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
          <div className="min-w-0"><h1 className="truncate font-extrabold">{picked.distributor.businessName}</h1><div className="text-xs text-ink/50">{[picked.distributor.district, picked.distributor.region].filter(Boolean).join(' · ')}</div></div>
        </header>
        <div className="mx-auto max-w-md space-y-2.5 px-5 pt-4">
          {picked.stock.length === 0 ? <EmptyState icon={<Package size={34} />} title={t('No stock listed', 'Hakuna bidhaa')} /> :
            picked.stock.map((s: any) => {
              const q = cart[s.productId] ?? 0;
              return (
                <Card key={s.id} className="flex items-center gap-3 !p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{label(s.product)}</div>
                    <div className="text-xs text-ink/50"><Money value={s.price} className="text-xs" /> · {s.stock} {t('available', 'zipo')}</div>
                  </div>
                  {q === 0 ? (
                    <button onClick={() => setQty(s.productId, 1)} className="rounded-xl bg-flame/10 px-3 py-2 text-sm font-bold text-flame">{t('Add', 'Ongeza')}</button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setQty(s.productId, q - 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-black/5"><Minus size={15} /></button>
                      <span className="w-6 text-center font-bold tabular-nums">{q}</span>
                      <button onClick={() => setQty(s.productId, Math.min(s.stock, q + 1))} className="grid h-8 w-8 place-items-center rounded-lg bg-flame/10 text-flame"><Plus size={15} /></button>
                    </div>
                  )}
                </Card>
              );
            })}
        </div>
        {lines.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/5 bg-white/95 p-4 backdrop-blur" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
            <div className="mx-auto flex max-w-md items-center gap-3">
              <div><div className="text-xs text-ink/50">{lines.reduce((s: number, l: any) => s + l.qty, 0)} {t('items', 'bidhaa')}</div><Money value={total} className="text-lg" /></div>
              <Button variant="primary" loading={busy} onClick={place} className="flex-1"><Truck size={17} /> {t('Place restock order', 'Tuma oda')}</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── My orders + distributor list view ──
  return (
    <div className="min-h-screen bg-sand pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/85 px-4 py-3 backdrop-blur">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">{t('Restock', 'Jaza bidhaa')}</h1>
      </header>
      <div className="mx-auto max-w-md space-y-5 px-5 pt-4">
        {orders.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-bold text-ink/70">{t('My restock orders', 'Oda zangu')}</h2>
            <div className="space-y-2">
              {orders.map((o) => {
                const st = STATUS[o.status] ?? STATUS.PLACED;
                return (
                  <Card key={o.id} className="!p-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0"><div className="truncate font-semibold">{o.distributor?.businessName}</div><div className="text-xs text-ink/50">{o.orderNo} · {o.items.length} {t('items', 'bidhaa')}</div></div>
                      <div className="flex items-center gap-2"><Money value={o.total} className="text-sm" /><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', st[2])}>{t(st[0], st[1])}</span></div>
                    </div>
                    {['ACCEPTED', 'DISPATCHED'].includes(o.status) && (
                      <Button variant="leaf" loading={busy} onClick={() => received(o.id)} className="mt-2 w-full !text-sm"><Check size={15} /> {t('Confirm received (add to my stock)', 'Thibitisha umepokea')}</Button>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink/70"><Truck size={15} /> {t('Order from a distributor', 'Agiza kutoka kwa msambazaji')}</h2>
          {dists.length === 0 ? <EmptyState icon={<Store size={34} />} title={t('No distributors yet', 'Hakuna wasambazaji')} sub={t('Distributors in your area will appear here.', 'Wasambazaji wataonekana hapa.')} /> :
            <div className="space-y-2">
              {dists.map((d) => (
                <button key={d.id} onClick={() => open(d.id)} className="block w-full text-left">
                  <Card className="flex items-center gap-3 !p-3 active:scale-[.99]">
                    <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-flame/10 text-flame"><Truck size={19} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5"><span className="truncate font-bold">{d.businessName}</span>{d.isVerified && <BadgeCheck size={15} className="flex-shrink-0 text-leaf" />}</div>
                      <div className="truncate text-xs text-ink/50">{[d.district, d.region].filter(Boolean).join(' · ')} · {d._count?.stock ?? 0} {t('products', 'bidhaa')}{d.brands ? ` · ${d.brands}` : ''}</div>
                    </div>
                    <Plus size={18} className="flex-shrink-0 text-flame" />
                  </Card>
                </button>
              ))}
            </div>}
        </div>
      </div>
      <RoleNav role="SUPPLIER" />
    </div>
  );
}
