'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Send, DollarSign, Check, CheckCheck, X, Loader2, Phone, ImageIcon } from 'lucide-react';
import { useSocket } from '../../../lib/useSocket';
import { formatUsdc, timeAgo } from '../../../lib/utils';
import PinInput from '../../../components/PinInput';

const API = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  return sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt') || '';
}
function getMyId(): string {
  try { return JSON.parse(atob(getToken().split('.')[1]))?.userId ?? ''; } catch { return ''; }
}
async function api(path: string, method = 'GET', body?: any) {
  const r = await fetch(`${API}/api/chat${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

// ── Notification ringtone (Web Audio API) ─────────────────────────────────────
function playTone() {
  try {
    const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    [[880,0,0.12],[1100,0.13,0.12],[1320,0.26,0.18]].forEach(([f,s,d]) => {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + s);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + s + d);
      o.connect(gain); o.start(ctx.currentTime + s); o.stop(ctx.currentTime + s + d);
    });
  } catch {}
}

// ── Tick icons ────────────────────────────────────────────────────────────────
function Ticks({ isRead, isDelivered }: { isRead: boolean; isDelivered: boolean }) {
  if (isRead)      return <CheckCheck size={13} className="text-blue-400 flex-shrink-0" />;
  if (isDelivered) return <CheckCheck size={13} className="text-white/50 flex-shrink-0" />;
  return <Check size={13} className="text-white/40 flex-shrink-0" />;
}

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ msg, isMine }: { msg: any; isMine: boolean }) {
  const text    = msg.plainContent ?? msg.encryptedContent ?? '';
  const isRead  = (msg.receipts?.length ?? 0) > 0;
  const isDeliv = isMine; // sender always sees double tick (delivered)

  if (msg.isDeleted) return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-0.5 px-3`}>
      <p className="italic text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-2xl">
        Ujumbe umefutwa
      </p>
    </div>
  );

  if (msg.type === 'SYSTEM') return (
    <div className="flex justify-center my-3">
      <p className="text-xs text-slate-400 bg-white dark:bg-slate-800 px-4 py-1.5 rounded-full shadow-sm">
        {msg.plainContent}
      </p>
    </div>
  );

  if (msg.type === 'PAYMENT' || msg.type === 'PAYMENT_REQUEST') {
    const confirmed = msg.paymentStatus === 'CONFIRMED';
    const pending   = msg.paymentStatus === 'PENDING';
    return (
      <div className="flex justify-center my-2 px-4">
        <div className={`w-full max-w-xs rounded-3xl border overflow-hidden ${
          confirmed ? 'border-green-200 bg-green-50 dark:bg-green-900/20' :
          pending   ? 'border-amber-200 bg-amber-50 dark:bg-amber-900/20' :
                      'border-red-200   bg-red-50   dark:bg-red-900/20'
        }`}>
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-slate-500 mb-1">
              {msg.type === 'PAYMENT_REQUEST'
                ? (isMine ? '💛 Uliomba' : '💛 Ombi la malipo')
                : (isMine ? '💸 Ulituma'  : '💚 Ulipokea')}
            </p>
            <p className="text-2xl font-bold">{formatUsdc(msg.amountUsdc ?? 0)}</p>
            {msg.paymentNote && (
              <p className="text-sm italic text-slate-500 mt-1">"{msg.paymentNote}"</p>
            )}
            <div className="flex items-center justify-between mt-3">
              <span className={`text-xs font-semibold ${confirmed ? 'text-green-600' : pending ? 'text-amber-600' : 'text-red-600'}`}>
                {confirmed ? '✓ Imethibitishwa' : pending ? '○ Inasubiri...' : '✕ Imeshindwa'}
              </span>
              {msg.stellarTxId && (
                <a href={`https://stellar.expert/explorer/testnet/tx/${msg.stellarTxId}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary underline">Stellar ↗</a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // IMAGE bubble
  if (msg.type === 'IMAGE' && (msg.mediaThumbUrl || msg.mediaUrl)) {
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-0.5 px-3`}>
        <div>
          <img
            src={msg.mediaThumbUrl ?? msg.mediaUrl}
            alt="Image"
            className="max-w-[220px] max-h-[220px] rounded-2xl object-cover cursor-pointer border border-slate-200 dark:border-slate-700"
            onClick={() => window.open(msg.mediaUrl, '_blank')}
          />
          <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[10px] text-slate-400">{timeAgo(msg.createdAt)}</span>
            {isMine && <Ticks isRead={isRead} isDelivered={isDeliv} />}
          </div>
        </div>
      </div>
    );
  }

  // TEXT bubble
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-0.5 px-3`}>
      <div className={`max-w-[78%] px-3.5 py-2 rounded-2xl ${
        isMine
          ? 'bg-primary text-white rounded-br-sm'
          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm shadow-sm border border-slate-100 dark:border-slate-700'
      }`}>
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{text}</p>
        <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-[10px] ${isMine ? 'text-white/60' : 'text-slate-400'}`}>
            {timeAgo(msg.createdAt)}
          </span>
          {isMine && <Ticks isRead={isRead} isDelivered={isDeliv} />}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ChatThread() {
  const { id: convId } = useParams() as { id: string };
  const router = useRouter();
  const myId   = getMyId();
  const { emit, on } = useSocket(getToken());

  const [messages,    setMessages]    = useState<any[]>([]);
  const [other,       setOther]       = useState<any>(null);
  const [text,        setText]        = useState('');
  const [loading,     setLoading]     = useState(true);
  const [isTyping,    setIsTyping]    = useState(false);
  const [showMoney,   setShowMoney]   = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const typingRef  = useRef<any>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const imgRef     = useRef<HTMLInputElement>(null);

  function scrollToBottom(smooth = true) {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' }), 60);
  }

  // Load conversation + messages
  useEffect(() => {
    if (!convId) return;
    Promise.all([
      api('/conversations'),
      api(`/conversations/${convId}/messages?limit=100`),
    ]).then(([cr, mr]) => {
      if (cr.success) {
        const conv = (cr.data.conversations ?? []).find((c: any) => c.id === convId);
        setOther(conv?.otherParticipants?.[0] ?? null);
      }
      if (mr.success) {
        setMessages(mr.data.messages ?? []);
        scrollToBottom(false);
        emit('join_conversation', { conversationId: convId });
        emit('mark_read', { conversationId: convId });
        api(`/conversations/${convId}/read`, 'POST');
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [convId]);

  // Socket events
  useEffect(() => {
    const u1 = on('new_message', (msg: any) => {
      if (msg.conversationId !== convId) return;

      setMessages(prev => {
        // Replace optimistic temp message from self
        if (msg.senderId === myId) {
          const tempIdx = prev.findIndex(m =>
            m.id.startsWith('temp_') && (
              m.plainContent === msg.encryptedContent ||
              m.plainContent === msg.plainContent ||
              m.encryptedContent === msg.encryptedContent
            )
          );
          if (tempIdx !== -1) {
            const next = [...prev];
            next[tempIdx] = { ...msg, deliveredAt: new Date().toISOString() };
            return next;
          }
        }
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      scrollToBottom();
      if (msg.senderId !== myId) {
        playTone();
        emit('mark_read', { conversationId: convId });
      }
    });

    const u2 = on('typing',         ({ userId }: any) => { if (userId !== myId) setIsTyping(true); });
    const u3 = on('stopped_typing', ()                => setIsTyping(false));
    const u4 = on('messages_read',  ({ messageIds }: any) => {
      setMessages(prev => prev.map(m =>
        messageIds.includes(m.id)
          ? { ...m, receipts: [{ userId: 'other', readAt: new Date().toISOString() }] }
          : m
      ));
    });
    const u5 = on('message_deleted', ({ messageId }: any) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeleted: true } : m));
    });
    const u6 = on('payment_confirmed', ({ messageId, stellarTxId, paymentStatus }: any) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, stellarTxId, paymentStatus } : m));
    });

    return () => { u1(); u2(); u3(); u4(); u5(); u6(); };
  }, [on, convId, myId]);

  async function sendImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }
    setUploadingImg(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API}/api/chat/media/upload`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body:    form,
      }).then(r => r.json());

      if (!res.success) { toast.error('Image upload failed'); return; }

      emit('send_message', {
        conversationId:  convId,
        encryptedContent: '[Image]',
        type:            'IMAGE',
        mediaUrl:        res.data.mediaUrl,
        mediaThumbUrl:   res.data.mediaThumbUrl,
        mediaMimeType:   res.data.mimeType,
      });
      scrollToBottom();
    } catch {
      toast.error('Image upload failed');
    } finally {
      setUploadingImg(false);
      if (imgRef.current) imgRef.current.value = '';
    }
  }

  function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');

    // Optimistic bubble
    const tempMsg = {
      id:               `temp_${Date.now()}`,
      conversationId:   convId,
      senderId:         myId,
      type:             'TEXT',
      plainContent:     trimmed,
      encryptedContent: trimmed,
      isDeleted:        false,
      deliveredAt:      null,
      createdAt:        new Date().toISOString(),
      receipts:         [],
    };
    setMessages(prev => [...prev, tempMsg]);
    scrollToBottom();

    emit('send_message', { conversationId: convId, encryptedContent: trimmed, type: 'TEXT' });
    clearTimeout(typingRef.current);
    emit('typing_stop', { conversationId: convId });
    inputRef.current?.focus();
  }

  function handleChange(val: string) {
    setText(val);
    emit('typing_start', { conversationId: convId });
    clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => emit('typing_stop', { conversationId: convId }), 2000);
  }

  const name = other?.kycName ?? other?.displayName ?? other?.phoneMasked ?? '...';

  return (
    <div className="h-screen flex flex-col bg-slate-100 dark:bg-slate-900">

      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-3 py-2.5 flex items-center gap-3 shadow-sm">
        <button onClick={() => router.push('/chat')}
          className="p-2 -ml-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
          <ArrowLeft size={20} />
        </button>
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm">
            {name.slice(0, 2).toUpperCase()}
          </div>
          {other?.isOnline && (
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{name}</p>
          <p className="text-xs text-slate-400">
            {isTyping ? '⌨️ Anaandika...' :
             other?.isOnline ? '🟢 Mtandaoni' :
             other?.lastSeenAt ? `Alionekana ${timeAgo(other.lastSeenAt)}` : 'Tuma'}
          </p>
        </div>
        <button className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
          <Phone size={18} className="text-slate-400" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 size={24} className="animate-spin text-slate-300" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-3 text-3xl">👋</div>
            <p className="font-semibold text-slate-600 dark:text-slate-400">Anza mazungumzo</p>
            <p className="text-xs text-slate-400 mt-1">Tuma ujumbe wako wa kwanza kwa {name}</p>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <Bubble key={msg.id} msg={msg} isMine={msg.senderId === myId} />
            ))}
            {isTyping && (
              <div className="flex items-center px-4 py-1">
                <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm flex gap-1.5">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-2 py-2 flex items-end gap-2">
        {/* Image picker */}
        <button onClick={() => imgRef.current?.click()} disabled={uploadingImg}
          className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 mb-0.5">
          {uploadingImg
            ? <Loader2 size={16} className="animate-spin text-slate-400" />
            : <ImageIcon size={16} className="text-slate-500" />}
        </button>
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={sendImage} />

        {/* Money button */}
        <button onClick={() => setShowMoney(true)}
          className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0 mb-0.5">
          <DollarSign size={18} className="text-green-600" />
        </button>
        <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-3xl px-4 py-2 flex items-end min-h-[42px]">
          <textarea ref={inputRef} value={text}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Andika ujumbe..." rows={1}
            className="flex-1 bg-transparent text-sm outline-none resize-none max-h-32 leading-relaxed"
            style={{ minHeight: '22px' }} />
        </div>
        <button onClick={sendMessage} disabled={!text.trim()}
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 transition-all ${
            text.trim() ? 'bg-primary text-white shadow-md active:scale-95' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
          }`}>
          <Send size={16} />
        </button>
      </div>

      {/* Hidden image input (also placed here as backup) */}
      {showMoney && (
        <MoneySheet name={name} recipientId={other?.id} convId={convId}
          onClose={() => setShowMoney(false)}
          onSent={() => { setShowMoney(false); scrollToBottom(); }}
          emit={emit} />
      )}
    </div>
  );
}

// ── Send/Request Money sheet ──────────────────────────────────────────────────
function MoneySheet({ name, recipientId, convId, onClose, onSent, emit }: any) {
  const [amount, setAmount] = useState('');
  const [note,   setNote]   = useState('');
  const [pin,    setPin]    = useState('');
  const [step,   setStep]   = useState<'amount'|'pin'>('amount');
  const [req,    setReq]    = useState(false);

  function doSend() {
    if (req) {
      emit('payment_request', { conversationId: convId, amountUsdc: parseFloat(amount), encryptedNote: note || null });
      toast.success('Ombi limetumwa!');
    } else {
      emit('send_payment', { conversationId: convId, amountUsdc: parseFloat(amount), encryptedNote: note || null, recipientId, pin });
      toast.success('Malipo yanakwenda...');
    }
    onSent();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-t-3xl px-5 pt-4 pb-10">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">{req ? `Omba kutoka ${name}` : `Tuma kwa ${name}`}</h3>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="flex gap-2 mb-4">
          <button onClick={() => setReq(false)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold ${!req ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}>
            💸 Tuma
          </button>
          <button onClick={() => setReq(true)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold ${req ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
            💛 Omba
          </button>
        </div>
        {step === 'amount' && (
          <div className="space-y-3">
            <input type="number" placeholder="0.00 USDC" value={amount}
              onChange={e => setAmount(e.target.value)} autoFocus
              className="w-full text-3xl font-bold text-center bg-slate-50 dark:bg-slate-800 rounded-2xl py-4 outline-none border-2 border-transparent focus:border-primary" />
            <input type="text" placeholder="Maelezo (hiari)" value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 text-sm outline-none" />
            <button onClick={() => req ? doSend() : setStep('pin')}
              disabled={parseFloat(amount) <= 0}
              className="w-full py-4 rounded-2xl font-bold text-white bg-primary disabled:opacity-40">
              {req ? `Omba ${formatUsdc(parseFloat(amount)||0)}` : 'Ingiza PIN →'}
            </button>
          </div>
        )}
        {step === 'pin' && !req && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-slate-500 text-sm">Ingiza PIN ya kuthibitisha malipo</p>
            <PinInput value={pin} onChange={setPin} autoFocus />
            <button onClick={doSend} disabled={pin.length < 6}
              className="w-full py-4 rounded-2xl font-bold text-white bg-primary disabled:opacity-40">
              Tuma {formatUsdc(parseFloat(amount))}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
