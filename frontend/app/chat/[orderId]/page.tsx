'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { chat, getAccessToken } from '../../../lib/api';
import { useSocket } from '../../../lib/useSocket';
import { useT } from '../../../lib/i18n';
import { Spinner, cn } from '../../../components/ui';

export default function ChatPage() {
  const router = useRouter();
  const { t } = useT();
  const { orderId } = useParams<{ orderId: string }>();
  const { on } = useSocket(getAccessToken());
  const [msgs, setMsgs] = useState<any[] | null>(null);
  const [me, setMe] = useState<string>('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chat.list(orderId).then((r) => { setMsgs(r.messages ?? []); setMe(r.me); }).catch(() => setMsgs([])); }, [orderId]);
  useEffect(() => {
    const off = on('chat:message', (m: any) => { if (m?.orderId === orderId) setMsgs((cur) => [...(cur ?? []), m]); });
    return () => { off?.(); };
  }, [on, orderId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  async function send() {
    const body = text.trim(); if (!body) return;
    setText(''); setBusy(true);
    // optimistic
    const optimistic = { id: 'tmp-' + Date.now(), orderId, senderId: me, body, createdAt: new Date().toISOString() };
    setMsgs((cur) => [...(cur ?? []), optimistic]);
    try { await chat.send(orderId, body); } catch { setText(body); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen flex-col bg-sand">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/90 px-4 py-3 backdrop-blur">
        <button onClick={() => router.back()} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">{t('Chat', 'Mazungumzo')}</h1>
      </header>

      <div className="mx-auto w-full max-w-md flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {msgs === null ? <Spinner /> :
          msgs.length === 0 ? <p className="py-10 text-center text-sm text-ink/50">{t('Say hello 👋', 'Salimia 👋')}</p> :
          msgs.map((m) => {
            const mine = m.senderId === me;
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'bg-grad-brand text-white' : 'bg-white text-ink shadow-ds-card')}>
                  {m.body}
                  <div className={cn('mt-0.5 text-[10px]', mine ? 'text-white/60' : 'text-ink/40')}>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            );
          })}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 border-t border-black/5 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder={t('Type a message…', 'Andika ujumbe…')} className="min-h-touch flex-1 rounded-2xl border border-black/15 bg-white px-4 text-ink outline-none focus:border-flame" />
          <button onClick={send} disabled={busy || !text.trim()} className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-grad-brand text-white disabled:opacity-50"><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
}
