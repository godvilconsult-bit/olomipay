'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, BadgeCheck, Minus, Plus, Star, MapPin, Phone, Smartphone, Banknote } from 'lucide-react';
import { vendors, addresses, orders } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { localPhone } from '../../../lib/utils';
import { Card, Button, Spinner, Money, cn } from '../../../components/ui';

export default function VendorPage() {
  const router = useRouter();
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const [vendor, setVendor] = useState<any>(null);
  const [addrs, setAddrs]   = useState<any[]>([]);
  const [cart, setCart]     = useState<Record<string, number>>({});
  const [pay, setPay]       = useState<'MOBILE' | 'CASH' | ''>('');
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    vendors.get(id).then((r) => setVendor(r.vendor)).catch(() => toast.error(t('Vendor not found', 'Muuzaji hapatikani')));
    addresses.list().then((r) => setAddrs(r.addresses ?? [])).catch(() => {});
  }, [id]);

  if (!vendor) return <div className="min-h-screen bg-sand"><Spinner /></div>;

  const defaultAddr = addrs.find((a) => a.isDefault) ?? addrs[0];
  const inv: any[] = vendor.inventory ?? [];
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  const total = items.reduce((s, [invId, q]) => { const i = inv.find((x) => x.id === invId); return s + (i ? i.price * q : 0); }, 0);
  const set = (invId: string, delta: number) => setCart((c) => ({ ...c, [invId]: Math.max(0, (c[invId] ?? 0) + delta) }));
  const typeLabel = (ty: string) => ty === 'REFILL' ? t('Refill', 'Kujaza') : ty === 'CYLINDER' ? t('New cylinder', 'Mtungi mpya') : t('Accessory', 'Kifaa');

  async function place() {
    if (!defaultAddr) return toast.error(t('Add an address first (Home → GPS)', 'Ongeza anwani kwanza (Nyumbani → GPS)'));
    if (items.length === 0) return toast.error(t('Select items', 'Chagua bidhaa'));
    if (!pay) return toast.error(t('Choose how to pay', 'Chagua njia ya malipo'));
    setPlacing(true);
    try {
      const r = await orders.place({ supplierId: id, addressId: defaultAddr.id, items: items.map(([inventoryId, qty]) => ({ inventoryId, qty })) });
      const oid = r.order.id;
      await orders.pay(oid, pay === 'CASH' ? { provider: 'CASH' } : {});
      toast.success(pay === 'CASH' ? t('Order placed — pay cash on delivery', 'Oda imewekwa — lipa cash ukipokea') : t('Order placed — check your phone to pay', 'Oda imewekwa — angalia simu kulipa'));
      router.replace(`/order/${oid}`);
    } catch (e: any) { toast.error(e?.message ?? t("Couldn't place order", 'Imeshindikana kuagiza')); }
    finally { setPlacing(false); }
  }

  return (
    <div className="min-h-screen bg-sand pb-44">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/90 px-4 py-3 backdrop-blur">
        <button onClick={() => router.back()} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5"><span className="truncate font-extrabold">{vendor.businessName}</span>{vendor.isVerified && <BadgeCheck size={15} className="text-leaf" />}</div>
          <div className="flex items-center gap-2 text-xs text-ink/50">
            <span className="inline-flex items-center gap-0.5"><Star size={11} className="fill-ember text-ember" />{vendor.rating ? vendor.rating.toFixed(1) : t('New', 'Mpya')}</span>
            <span className="inline-flex items-center gap-0.5"><MapPin size={11} />{vendor.district ?? vendor.region}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-3 px-5 pt-4">
        {/* vendor business details + payment (declared at KYC) */}
        <Card className="space-y-2.5 !p-3">
          <div className="flex items-center justify-between gap-2">
            <a href={`tel:${vendor.phone}`} className="flex items-center gap-2 text-sm font-semibold text-flame"><Phone size={15} /> {localPhone(vendor.phone)}</a>
            <span className="inline-flex items-center gap-1 text-xs text-ink/50"><MapPin size={12} /> {[vendor.ward, vendor.district, vendor.region].filter(Boolean).join(', ') || '—'}</span>
          </div>
          {vendor.description && <p className="text-xs leading-relaxed text-ink/60">{vendor.description}</p>}
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink/60">
            <span>{t('Accepts', 'Inakubali')}:</span>
            {vendor.acceptsMobile !== false && <span className="inline-flex items-center gap-1 rounded-full bg-leaf/10 px-2 py-0.5 text-leaf-dark"><Smartphone size={12} /> {t('Mobile money', 'Pesa za simu')}</span>}
            {vendor.acceptsCash !== false && <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5"><Banknote size={12} /> {t('Cash', 'Cash')}</span>}
          </div>
          {vendor.payNumber && (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-leaf/10 p-2.5">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wide text-leaf-dark/70">{t('Mobile wallet payment', 'Malipo ya pochi')}</div>
                <div className="truncate text-sm font-bold text-ink">{vendor.payProvider ?? t('Mobile money', 'Pesa za simu')} · <span className="tabular-nums">{vendor.payNumber}</span></div>
                {vendor.payName && <div className="truncate text-xs text-ink/50">{vendor.payName}</div>}
              </div>
              <button onClick={() => { try { navigator.clipboard?.writeText(vendor.payNumber); toast.success(t('Number copied', 'Namba imenakiliwa')); } catch {} }} className="flex-shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-leaf-dark">{t('Copy', 'Nakili')}</button>
            </div>
          )}
        </Card>

        {inv.length === 0 && <p className="py-10 text-center text-sm text-ink/50">{t('This vendor has no products right now.', 'Muuzaji huyu hana bidhaa kwa sasa.')}</p>}
        {inv.map((i) => {
          const qty = cart[i.id] ?? 0; const out = i.stock <= 0;
          return (
            <Card key={i.id} className={cn('flex items-center justify-between !p-3.5', out && 'opacity-50')}>
              <div className="min-w-0">
                <div className="font-semibold">{i.product.brand} · {i.product.name}</div>
                <div className="text-xs text-ink/50">{typeLabel(i.product.type)}{out ? ` · ${t('Out of stock', 'Imeisha')}` : ` · ${t('Stock', 'Stock')} ${i.stock}`}</div>
                <Money value={i.price} className="mt-1 block text-flame" />
              </div>
              {!out && (
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button onClick={() => set(i.id, -1)} disabled={qty === 0} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 disabled:opacity-40"><Minus size={16} /></button>
                  <span className="w-5 text-center font-bold tabular-nums">{qty}</span>
                  <button onClick={() => set(i.id, 1)} disabled={qty >= i.stock} className="grid h-9 w-9 place-items-center rounded-xl bg-grad-brand text-white disabled:opacity-40"><Plus size={16} /></button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* sticky checkout */}
      {total > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 space-y-2 border-t border-black/5 bg-white/95 px-5 py-3 backdrop-blur">
          <div className="mx-auto max-w-md">
            <div className="mb-2 flex items-center gap-2">
              {vendor.acceptsMobile !== false && <button onClick={() => setPay('MOBILE')} className={cn('flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl py-2.5 text-[13px] sm:text-sm font-semibold', pay === 'MOBILE' ? 'bg-grad-leaf text-white' : 'bg-black/5 text-ink/70')}><Smartphone size={15} /> {t('Mobile money', 'Pesa za simu')}</button>}
              {vendor.acceptsCash !== false && <button onClick={() => setPay('CASH')} className={cn('flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl py-2.5 text-[13px] sm:text-sm font-semibold', pay === 'CASH' ? 'bg-ink text-white' : 'bg-black/5 text-ink/70')}><Banknote size={15} /> {t('Cash', 'Cash')}</button>}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1"><div className="text-xs text-ink/50">{t('Gas total (rider fee confirmed later)', 'Jumla ya gesi (ada ya dereva baadaye)')}</div><Money value={total} className="text-lg" /></div>
              <Button variant="primary" loading={placing} onClick={place} className="px-6">{t('Order & pay', 'Agiza & lipa')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
