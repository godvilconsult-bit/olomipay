'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Send, LifeBuoy } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PageHeader from '../../components/PageHeader';
import { support } from '../../lib/api';

const CATEGORIES = [
  { id: 'DEPOSIT', label: 'Deposit' },
  { id: 'WITHDRAWAL', label: 'Withdrawal' },
  { id: 'PAYMENT', label: 'Payment / transfer' },
  { id: 'WALLET', label: 'Wallet / PIN' },
  { id: 'KYC', label: 'Identity (KYC)' },
  { id: 'ACCOUNT', label: 'Account' },
  { id: 'GENERAL', label: 'Something else' },
];

type View = 'list' | 'new' | 'thread';

export default function SupportPage() {
  const router = useRouter();
  const [view, setView] = useState<View>('list');
  const [tickets, setTickets] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // New-ticket form
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [body, setBody] = useState('');

  // Thread reply
  const [reply, setReply] = useState('');

  const loadList = async () => {
    try { const r: any = await support.list(); setTickets(r.data.tickets ?? []); } catch {}
  };
  useEffect(() => { loadList(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const openThread = async (id: string) => {
    try {
      const r: any = await support.get(id);
      setActive(r.data.ticket); setMessages(r.data.messages ?? []); setView('thread');
    } catch (e: any) { toast.error(e.message ?? 'Could not open ticket'); }
  };

  const createTicket = async () => {
    if (!subject.trim() || !body.trim()) { toast.error('Add a subject and describe your issue'); return; }
    setLoading(true);
    try {
      const r: any = await support.open({ subject, category, body });
      toast.success('Ticket sent — we\'ll reply soon');
      setSubject(''); setBody(''); setCategory('GENERAL');
      await loadList();
      await openThread(r.data.ticket.id);
    } catch (e: any) { toast.error(e.message ?? 'Failed to send'); }
    finally { setLoading(false); }
  };

  const sendReply = async () => {
    if (!reply.trim() || !active) return;
    const text = reply; setReply('');
    setMessages(m => [...m, { id: 'tmp' + Date.now(), authorType: 'USER', body: text, createdAt: new Date().toISOString() }]);
    try { await support.reply(active.id, text); } catch (e: any) { toast.error(e.message ?? 'Failed'); }
  };

  const statusChip = (s: string) => (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
      s === 'RESOLVED' ? 'bg-success/15 text-success' : s === 'PENDING' ? 'bg-amber-500/15 text-amber-600' : 'bg-primary/15 text-primary'
    }`}>{s === 'PENDING' ? 'Replied' : s === 'OPEN' ? 'Open' : 'Resolved'}</span>
  );

  return (
    <div className="min-h-screen pb-24">
      <PageHeader eyebrow="Account"
        title={view === 'new' ? 'New request' : view === 'thread' ? (active?.subject ?? 'Ticket') : 'Help & support'}
        onBack={() => view === 'list' ? router.back() : setView('list')}
        right={view === 'list' ? (
          <button onClick={() => setView('new')} className="flex items-center gap-1.5 text-sm text-primary font-semibold bg-primary/10 px-3 py-1.5 rounded-xl">
            <Plus size={15} /> New
          </button>
        ) : undefined} />

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {/* LIST */}
        {view === 'list' && (
          tickets.length === 0 ? (
            <div className="text-center py-16">
              <LifeBuoy size={44} className="mx-auto text-slate-300" />
              <p className="mt-3 font-semibold">Need a hand?</p>
              <p className="text-sm text-slate-400 mt-1">Open a request and our team will help you.</p>
              <button onClick={() => setView('new')} className="btn-primary mt-5 px-6">Open a request</button>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map(t => (
                <button key={t.id} onClick={() => openThread(t.id)} className="card w-full text-left flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{t.subject}</p>
                    <p className="text-xs text-slate-400">{new Date(t.lastMessageAt).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.unreadForUser && <span className="w-2.5 h-2.5 bg-primary rounded-full" />}
                    {statusChip(t.status)}
                  </div>
                </button>
              ))}
            </div>
          )
        )}

        {/* NEW */}
        {view === 'new' && (
          <>
            <div className="card space-y-3">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">What do you need help with?</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="input font-medium">
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="card space-y-3">
              <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={140}
                placeholder="Subject (e.g. Deposit not received)" className="input" />
              <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={4000} rows={6}
                placeholder="Describe what happened. Include amounts, dates and the phone number used." className="input resize-none" />
            </div>
            <button onClick={createTicket} disabled={loading} className="btn-primary w-full">
              {loading ? 'Sending…' : 'Send request'}
            </button>
          </>
        )}

        {/* THREAD */}
        {view === 'thread' && active && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{CATEGORIES.find(c => c.id === active.category)?.label ?? active.category}</span>
              {statusChip(active.status)}
            </div>
            <div className="space-y-2 pb-4">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.authorType === 'USER' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                    m.authorType === 'USER' ? 'bg-primary text-white rounded-br-sm' : 'bg-white dark:bg-slate-800 rounded-bl-sm shadow-sm'
                  }`}>
                    {m.authorType === 'ADMIN' && <p className="text-[11px] font-semibold text-primary mb-0.5">OlomiPay Support</p>}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`text-[10px] mt-1 ${m.authorType === 'USER' ? 'text-white/70' : 'text-slate-400'}`}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </>
        )}
      </div>

      {/* Thread composer (fixed) */}
      {view === 'thread' && active && active.status !== 'RESOLVED' && (
        <div className="fixed bottom-0 inset-x-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center gap-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
          <input value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendReply()}
            placeholder="Type a reply…" className="input flex-1" />
          <button onClick={sendReply} disabled={!reply.trim()} className="btn-primary px-4 py-2.5 rounded-xl">
            <Send size={18} />
          </button>
        </div>
      )}

      {view !== 'thread' && <BottomNav />}
    </div>
  );
}
