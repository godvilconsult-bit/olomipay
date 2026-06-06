'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Phone, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import BottomNav from '../../../components/BottomNav';

async function agentApi(path: string) {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt')) : null;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agents${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export default function FindAgentsPage() {
  const router = useRouter();
  const [city, setCity] = useState('');
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = (q = '') => {
    setLoading(true);
    agentApi(`/directory?country=TZ${q ? `&city=${encodeURIComponent(q)}` : ''}`)
      .then(r => { if (r.success) setAgents(r.data.agents); }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">Cash points near you</h1>
      </div>

      <div className="px-5 max-w-md mx-auto mt-4 space-y-3">
        <div className="flex gap-2">
          <input value={city} onChange={e => setCity(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(city)} placeholder="Search by city / area" className="input flex-1" />
          <button onClick={() => load(city)} className="btn-primary px-4">Search</button>
        </div>

        {loading ? <div className="card"><div className="skeleton h-16 w-full" /></div> :
          agents.length === 0 ? <div className="card text-center text-slate-400 py-8 text-sm">No agents found here yet.</div> :
          agents.map(a => (
            <div key={a.id} className="card">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary">{a.businessName[0]}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{a.businessName}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={11} /> {a.city}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Phone size={11} /> {a.phone}</p>
                </div>
              </div>
              <button onClick={() => { navigator.clipboard?.writeText(a.code); toast.success('Agent code copied'); }}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-primary border border-primary/30 rounded-xl py-2">
                <Copy size={14} /> {a.code}
              </button>
            </div>
          ))}
      </div>
      <BottomNav />
    </div>
  );
}
