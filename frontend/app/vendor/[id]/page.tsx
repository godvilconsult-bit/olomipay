'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, BadgeCheck, Minus, Plus, Star, MapPin } from 'lucide-react';
import { vendors, addresses, orders } from '../../../lib/api';
import { Card, Button, Spinner, Money, cn } from '../../../components/ui';

export default function VendorPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [vendor, setVendor] = useState<any>(null);
  const [addrs, setAddrs]   = useState<any[]>([]);
  const [cart, setCart]     = useState<Record<string, number>>({});
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    vendors.get(id).then((r) => setVendor(r.vendor)).catch(() => toast.error('Muuzaji hapatikani'));
    addresses.list().then((r) => setAddrs(r.addresses ?? [])).catch(() => {});
  }, [id]);

  if (!vendor) return <div className="min-h-screen bg-sand dark:bg-background-dark"><Spinner /></div>;

  const defaultAddr = addrs.find((a) => a.isDefault) ?? addrs[0];
  const inv: any[] = vendor.inventory ?? [];
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  const total = items.reduce((s, [invId, q]) => { const i = inv.find((x) => x.id === invId); return s + (i ? i.price * q : 0); }, 0);
  const set = (invId: string, delta: number) => setCart((c) => ({ ...c, [invId]: Math.max(0, (c[invId] ?? 0) + delta) }));

  async function place() {
    if (!defaultAddr) return toast.error('Ongeza anwani kwanza (rudi nyumbani, bonyeza GPS)');
    if (items.length === 0) return toast.error('Chagua bidhaa');
    setPlacing(true);
    try {
      const r = await orders.place({ supplierId: id, addressId: defaultAddr.id, items: items.map(([inventoryId, qty]) => ({ inventoryId, qty })) });
      toast.success('Oda imetumwa kwa muuzaji!');
      router.replace(`/order/${r.order.id}`);
    } catch (e: any) { toast.error(e?.message ?? 'Imeshindikana kuagiza'); }
    finally { setPlacing(false); }
  }

  return (
    <div className="min-h-screen bg-sand dark:bg-background-dark pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/85 px-4 py-3 backdrop-blur dark:bg-background-dark/85">
        <button onClick={() => router.back()} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10"><ArrowLeft size={18} /></button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5"><span className="truncate font-extrabold">{vendor.businessName}</span>{vendor.isVerified && <BadgeCheck size={15} className="text-leaf" />}</div>
          <div className="flex items-center gap-2 text-xs text-ink/50">
            <span className="inline-flex items-center gap-0.5"><Star size={11} className="fill-ember text-ember" />{vendor.rating ? vendor.rating.toFixed(1) : 'Mpya'}</span>
            <span className="inline-flex items-center gap-0.5"><MapPin size={11} />{vendor.district ?? vendor.region}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-2.5 px-5 pt-4">
        {inv.length === 0 && <p className="py-10 text-center text-sm text-ink/50">Muuzaji huyu hana bidhaa kwa sasa.</p>}
        {inv.map((i) => {
          const qty = cart[i.id] ?? 0;
          const out = i.stock <= 0;
          return (
            <Card key={i.id} className={cn('flex items-center justify-between !p-3.5', out && 'opacity-50')}>
              <div className="min-w-0">
                <div className="font-semibold">{i.product.brand} · {i.product.name}</div>
                <div className="text-xs text-ink/50">{i.product.type === 'REFILL' ? 'Kujaza' : i.product.type === 'CYLINDER' ? 'Mtungi mpya' : 'Kifaa'}{out ? ' · Imeisha' : ` · Stock ${i.stock}`}</div>
                <Money value={i.price} className="mt-1 block text-flame" />
              </div>
              {!out && (
                <div className="flex items-center gap-2">
                  <button onClick={() => set(i.id, -1)} disabled={qty === 0} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 disabled:opacity-40 dark:bg-white/10"><Minus size={16} /></button>
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
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/5 bg-white/95 px-5 py-3 backdrop-blur dark:bg-ink-2/95">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <div className="flex-1"><div className="text-xs text-ink/50">Jumla ya bidhaa (bila usafiri)</div><Money value={total} className="text-lg" /></div>
            <Button variant="primary" loading={placing} onClick={place} className="px-7">Agiza sasa</Button>
          </div>
        </div>
      )}
    </div>
  );
}
