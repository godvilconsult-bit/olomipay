'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Save, AlertTriangle, PackagePlus, Truck } from 'lucide-react';
import { suppliers, vendors } from '../../../lib/api';
import { Card, Button, Spinner, EmptyState, Money, cn } from '../../../components/ui';
import { RoleNav } from '../../../components/RoleNav';

export default function InventoryPage() {
  const router = useRouter();
  const [inv, setInv]         = useState<any[] | null>(null);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [edits, setEdits]     = useState<Record<string, { price: number; stock: number; isAvailable: boolean }>>({});
  const [adding, setAdding]   = useState({ productId: '', price: '', stock: '' });
  const [restock, setRestock] = useState({ productId: '', qty: '' });
  const [reqs, setReqs]       = useState<any[]>([]);
  const [busy, setBusy]       = useState<string | null>(null);

  async function load() {
    try {
      const [i, p, r] = await Promise.all([suppliers.inventory(), vendors.products(), suppliers.restockList().catch(() => ({ requests: [] }))]);
      setInv(i.inventory ?? []);
      setCatalog(p.products ?? []);
      setReqs(r.requests ?? []);
      const e: any = {};
      for (const row of i.inventory ?? []) e[row.id] = { price: row.price, stock: row.stock, isAvailable: row.isAvailable };
      setEdits(e);
    } catch (err: any) {
      if (err?.status === 403) router.replace('/dashboard');
      setInv([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function save(row: any) {
    const e = edits[row.id];
    setBusy(row.id);
    try { await suppliers.setInventory({ productId: row.productId, price: Number(e.price), stock: Number(e.stock), isAvailable: e.isAvailable }); toast.success('Imehifadhiwa'); }
    catch { toast.error('Imeshindikana'); } finally { setBusy(null); }
  }

  async function add() {
    if (!adding.productId || !adding.price) return toast.error('Chagua bidhaa na bei');
    setBusy('add');
    try { await suppliers.setInventory({ productId: adding.productId, price: Number(adding.price), stock: Number(adding.stock || 0) }); setAdding({ productId: '', price: '', stock: '' }); await load(); toast.success('Bidhaa imeongezwa'); }
    catch { toast.error('Imeshindikana'); } finally { setBusy(null); }
  }

  async function sendRestock() {
    if (!restock.qty) return toast.error('Weka idadi');
    setBusy('restock');
    try { await suppliers.restock({ productId: restock.productId || undefined, qty: Number(restock.qty) }); setRestock({ productId: '', qty: '' }); await load(); toast.success('Ombi la kujaza limetumwa'); }
    catch { toast.error('Imeshindikana'); } finally { setBusy(null); }
  }

  if (inv === null) return <div className="min-h-screen bg-sand dark:bg-background-dark"><Spinner /></div>;

  const ownedIds = new Set(inv.map((i) => i.productId));
  const addable = catalog.filter((p) => !ownedIds.has(p.id));

  return (
    <div className="min-h-screen bg-sand dark:bg-background-dark pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/85 px-4 py-3 backdrop-blur dark:bg-background-dark/85">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5 dark:bg-white/10"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">Bidhaa & Stock</h1>
      </header>

      <div className="mx-auto max-w-md space-y-5 px-5 pt-4">
        {/* current inventory */}
        <div>
          <h2 className="mb-2 text-sm font-bold text-ink/70">Bidhaa zako ({inv.length})</h2>
          {inv.length === 0 ? <EmptyState icon={<PackagePlus size={34} />} title="Bado hujaweka bidhaa" sub="Ongeza bidhaa hapa chini ili uonekane kwenye utafutaji." /> :
            <div className="space-y-2.5">
              {inv.map((row) => {
                const e = edits[row.id] ?? { price: row.price, stock: row.stock, isAvailable: row.isAvailable };
                const low = e.stock <= 3;
                return (
                  <Card key={row.id} className="!p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{row.product.brand} · {row.product.name}</div>
                      {low && <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning"><AlertTriangle size={13} /> ndogo</span>}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="text-xs text-ink/50">Bei (TZS)
                        <input type="number" value={e.price} onChange={(ev) => setEdits((s) => ({ ...s, [row.id]: { ...e, price: +ev.target.value } }))} className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-flame dark:bg-ink" />
                      </label>
                      <label className="text-xs text-ink/50">Stock
                        <input type="number" value={e.stock} onChange={(ev) => setEdits((s) => ({ ...s, [row.id]: { ...e, stock: +ev.target.value } }))} className={cn('mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-flame dark:bg-ink', low ? 'border-warning/50' : 'border-black/10')} />
                      </label>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <button onClick={() => setEdits((s) => ({ ...s, [row.id]: { ...e, isAvailable: !e.isAvailable } }))} className={cn('rounded-full px-3 py-1 text-xs font-semibold', e.isAvailable ? 'bg-leaf/15 text-leaf-dark' : 'bg-black/10 text-ink/50')}>{e.isAvailable ? 'Inapatikana' : 'Imezimwa'}</button>
                      <Button variant="primary" className="!min-h-0 !py-2 !text-sm" loading={busy === row.id} onClick={() => save(row)}><Save size={15} /> Hifadhi</Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          }
        </div>

        {/* add product */}
        {addable.length > 0 && (
          <Card>
            <div className="mb-2 flex items-center gap-1.5 font-bold"><Plus size={16} className="text-flame" /> Ongeza bidhaa</div>
            <select value={adding.productId} onChange={(e) => setAdding((a) => ({ ...a, productId: e.target.value }))} className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-flame dark:bg-ink">
              <option value="">— chagua bidhaa —</option>
              {addable.map((p) => <option key={p.id} value={p.id}>{p.brand} · {p.name}</option>)}
            </select>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input type="number" placeholder="Bei (TZS)" value={adding.price} onChange={(e) => setAdding((a) => ({ ...a, price: e.target.value }))} className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-flame dark:bg-ink" />
              <input type="number" placeholder="Stock" value={adding.stock} onChange={(e) => setAdding((a) => ({ ...a, stock: e.target.value }))} className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-flame dark:bg-ink" />
            </div>
            <Button variant="leaf" className="mt-2 w-full" loading={busy === 'add'} onClick={add}>Ongeza</Button>
          </Card>
        )}

        {/* restock (middle-mile) */}
        <Card>
          <div className="mb-2 flex items-center gap-1.5 font-bold"><Truck size={16} className="text-flame" /> Omba kujaza kutoka kwa distributor</div>
          <div className="grid grid-cols-3 gap-2">
            <select value={restock.productId} onChange={(e) => setRestock((r) => ({ ...r, productId: e.target.value }))} className="col-span-2 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-flame dark:bg-ink">
              <option value="">Bidhaa yoyote</option>
              {inv.map((row) => <option key={row.productId} value={row.productId}>{row.product.brand} · {row.product.name}</option>)}
            </select>
            <input type="number" placeholder="Idadi" value={restock.qty} onChange={(e) => setRestock((r) => ({ ...r, qty: e.target.value }))} className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-flame dark:bg-ink" />
          </div>
          <Button variant="ghost" className="mt-2 w-full" loading={busy === 'restock'} onClick={sendRestock}>Tuma ombi</Button>
          {reqs.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-black/5 pt-2 text-xs text-ink/60">
              {reqs.slice(0, 4).map((r) => <div key={r.id} className="flex justify-between"><span>{r.qty} vipande</span><span className="font-medium">{r.status}</span></div>)}
            </div>
          )}
        </Card>
      </div>

      <RoleNav role="SUPPLIER" />
    </div>
  );
}
