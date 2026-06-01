'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Send, DollarSign, Check, CheckCheck, X,
  Loader2, ImageIcon, CheckCircle2, XCircle,
} from 'lucide-react';
import { useSocket } from '../../../lib/useSocket';
import { formatUsdc, timeAgo } from '../../../lib/utils';
import PinInput from '../../../components/PinInput';

const API = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  return sessionStorage.getItem('olomipay_at') || (sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt')) || '';
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

// ── Sound player (Web Audio API — works even on mobile) ───────────────────────
const sounds = {
  /** Incoming chat message */
  message(): void {
    try {
      const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      [[880, 0, 0.12], [1100, 0.13, 0.12], [1320, 0.26, 0.18]].forEach(([f, s, d]) => {
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + s);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + s + d);
        o.connect(gain); o.start(ctx.currentTime + s); o.stop(ctx.currentTime + s + d);
      });
    } catch {}
  },
  /** Money received — longer, celebratory */
  moneyIn(): void {
    try {
      const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      [[523, 0, 0.15], [659, 0.12, 0.15], [784, 0.25, 0.15], [1047, 0.38, 0.25]].forEach(([f, s, d]) => {
        const o = ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = f;
        gain.gain.setValueAtTime(0.4, ctx.currentTime + s);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + s + d);
        o.connect(gain); o.start(ctx.currentTime + s); o.stop(ctx.currentTime + s + d);
      });
    } catch {}
  },
  /** Money sent — short confirm */
  moneyOut(): void {
    try {
      const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      [[659, 0, 0.1], [523, 0.11, 0.15]].forEach(([f, s, d]) => {
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f;
        gain.gain.setValueAtTime(0.25, ctx.currentTime + s);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + s + d);
        o.connect(gain); o.start(ctx.currentTime + s); o.stop(ctx.currentTime + s + d);
      });
    } catch {}
  },
  /** Payment request — attention-grabbing ping */
  request(): void {
    try {
      const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      [[1200, 0, 0.08], [900, 0.1, 0.08], [1200, 0.25, 0.12]].forEach(([f, s, d]) => {
        const o = ctx.createOscillator();
        o.type = 'square'; o.frequency.value = f;
        gain.gain.setValueAtTime(0.2, ctx.currentTime + s);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + s + d);
        o.connect(gain); o.start(ctx.currentTime + s); o.stop(ctx.currentTime + s + d);
      });
    } catch {}
  },
};

// ── Tick icons ─────────────────────────────────────────────────────────────────
function Ticks({ isRead, isDelivered }: { isRead: boolean; isDelivered: boolean }) {
  if (isRead)      return <CheckCheck size={13} className="text-blue-400 flex-shrink-0" />;
  if (isDelivered) return <CheckCheck size={13} className="text-white/50 flex-shrink-0" />;
  return <Check size={13} className="text-white/40 flex-shrink-0" />;
}

// ── Payment bubble (PAYMENT or PAYMENT_REQUEST) ───────────────────────────────
function PaymentBubble({
  msg, isMine, onAccept, onReject,
}: {
  msg:      any;
  isMine:   boolean;
  onAccept: (messageId: string, amount: number) => void;
  onReject: (messageId: string) => void;
}) {
  const confirmed = msg.paymentStatus === 'CONFIRMED';
  const failed    = msg.paymentStatus === 'FAILED';
  const pending   = msg.paymentStatus === 'PENDING';
  const isRequest = msg.type === 'PAYMENT_REQUEST';

  const borderCls = confirmed
    ? 'border-green-200 bg-green-50 dark:bg-green-900/20'
    : failed
    ? 'border-red-200 bg-red-50 dark:bg-red-900/20'
    : 'border-amber-200 bg-amber-50 dark:bg-amber-900/20';

  return (
    <div className="flex justify-center my-2 px-4">
      <div className={`w-full max-w-xs rounded-3xl border-2 overflow-hidden ${borderCls}`}>
        <div className="px-4 pt-3 pb-2">
          {/* Header label */}
          <p className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
            {isRequest
              ? isMine ? '💛 You requested' : '💛 Payment request'
              : isMine ? '💸 You sent'       : '💚 You received'}
          </p>

          {/* Amount */}
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatUsdc(msg.amountUsdc ?? 0)}
          </p>

          {/* Note */}
          {msg.paymentNote && (
            <p className="text-sm italic text-slate-500 mt-1">
              "{msg.paymentNote}"
            </p>
          )}

          {/* Status row */}
          <div className="flex items-center justify-between mt-2">
            <span className={`text-xs font-semibold ${
              confirmed ? 'text-green-600' : failed ? 'text-red-500' : 'text-amber-600'
            }`}>
              {confirmed ? '✓ Confirmed' : failed ? '✕ Declined' : '○ Pending…'}
            </span>
            {msg.stellarTxId && (
              <a href={`https://stellar.expert/explorer/testnet/tx/${msg.stellarTxId}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary underline">
                Stellar ↗
              </a>
            )}
          </div>
        </div>

        {/* Accept / Reject buttons — only for pending REQUEST that's NOT mine */}
        {isRequest && pending && !isMine && (
          <div className="flex border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => onReject(msg.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-r border-slate-200 dark:border-slate-700">
              <XCircle size={16} />
              Decline
            </button>
            <button
              onClick={() => onAccept(msg.id, msg.amountUsdc)}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
              <CheckCircle2 size={16} />
              Pay Now
            </button>
          </div>
        )}

        {/* My pending request — waiting state */}
        {isRequest && pending && isMine && (
          <div className="border-t border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-center gap-2">
            <Loader2 size={13} className="animate-spin text-amber-500" />
            <span className="text-xs text-amber-600">Waiting for payment…</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────
function Bubble({
  msg, isMine, onAccept, onReject,
}: {
  msg:      any;
  isMine:   boolean;
  onAccept: (messageId: string, amount: number) => void;
  onReject: (messageId: string) => void;
}) {
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
    return <PaymentBubble msg={msg} isMine={isMine} onAccept={onAccept} onReject={onReject} />;
  }

  if (msg.type === 'IMAGE' && (msg.mediaThumbUrl || msg.mediaUrl)) {
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-0.5 px-3`}>
        <div>
          <img src={msg.mediaThumbUrl ?? msg.mediaUrl} alt="Image"
            className="max-w-[220px] max-h-[220px] rounded-2xl object-cover cursor-pointer border border-slate-200 dark:border-slate-700"
            onClick={() => window.open(msg.mediaUrl, '_blank')} />
          <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[10px] text-slate-400">{timeAgo(msg.createdAt)}</span>
            {isMine && <Ticks isRead={(msg.receipts?.length ?? 0) > 0} isDelivered />}
          </div>
        </div>
      </div>
    );
  }

  const text = msg.plainContent ?? msg.encryptedContent ?? '';
  const isRead  = (msg.receipts?.length ?? 0) > 0;

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
          {isMine && <Ticks isRead={isRead} isDelivered />}
        </div>
      </div>
    </div>
  );
}

// ── Accept Payment PIN modal ───────────────────────────────────────────────────
function AcceptPayModal({
  amount, onConfirm, onClose, loading,
}: {
  amount:    number;
  onConfirm: (pin: string) => void;
  onClose:   () => void;
  loading:   boolean;
}) {
  const [pin, setPin] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-t-3xl px-5 pt-5 pb-10 space-y-5">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto" />
        <div className="text-center">
          <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={32} className="text-green-500" />
          </div>
          <h3 className="font-bold text-lg">Confirm Payment</h3>
          <p className="text-slate-500 text-sm mt-1">
            You are about to send <strong>{formatUsdc(amount)}</strong>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">1% platform fee applies</p>
        </div>
        <div>
          <p className="text-sm text-center text-slate-500 mb-3">Enter your 6-digit PIN</p>
          <PinInput value={pin} onChange={setPin} autoFocus />
        </div>
        <button
          onClick={() => { if (pin.length === 6) onConfirm(pin); }}
          disabled={pin.length < 6 || loading}
          className="w-full py-4 rounded-2xl font-bold text-white bg-green-500 disabled:opacity-40 flex items-center justify-center gap-2">
          {loading
            ? <><Loader2 size={16} className="animate-spin" /> Processing…</>
            : `Pay ${formatUsdc(amount)}`}
        </button>
        <button onClick={onClose} className="w-full text-sm text-slate-400 py-2">Cancel</button>
      </div>
    </div>
  );
}

// ── Main chat thread ───────────────────────────────────────────────────────────
export default function ChatThread() {
  const { id: convId } = useParams() as { id: string };
  const router  = useRouter();
  const myId    = getMyId();
  const { emit, on } = useSocket(getToken());

  const [messages,     setMessages]     = useState<any[]>([]);
  const [other,        setOther]        = useState<any>(null);
  const [text,         setText]         = useState('');
  const [loading,      setLoading]      = useState(true);
  const [isTyping,     setIsTyping]     = useState(false);
  const [showMoney,    setShowMoney]    = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  // Accept/reject state
  const [acceptModal,  setAcceptModal]  = useState<{ messageId: string; amount: number } | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const typingRef  = useRef<any>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const imgRef     = useRef<HTMLInputElement>(null);

  function scrollToBottom(smooth = true) {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' }), 60);
  }

  // ── Load conversation + messages ──────────────────────────────────────────
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

  // ── Socket events ─────────────────────────────────────────────────────────
  useEffect(() => {
    // New message (text, image, payment, request)
    const u1 = on('new_message', (msg: any) => {
      if (msg.conversationId !== convId) return;
      setMessages(prev => {
        if (msg.senderId === myId) {
          const idx = prev.findIndex(m => m.id.startsWith('temp_') && (
            m.plainContent === msg.encryptedContent || m.plainContent === msg.plainContent
          ));
          if (idx !== -1) {
            const next = [...prev]; next[idx] = { ...msg, deliveredAt: new Date().toISOString() }; return next;
          }
        }
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      scrollToBottom();
      if (msg.senderId !== myId) {
        // Play appropriate sound
        if (msg.type === 'PAYMENT')         sounds.moneyIn();
        else if (msg.type === 'PAYMENT_REQUEST') sounds.request();
        else                                 sounds.message();
        emit('mark_read', { conversationId: convId });
      }
    });

    const u2 = on('typing',         ({ userId }: any) => { if (userId !== myId) setIsTyping(true); });
    const u3 = on('stopped_typing', ()                => setIsTyping(false));

    const u4 = on('messages_read', ({ messageIds }: any) => {
      setMessages(prev => prev.map(m =>
        messageIds.includes(m.id)
          ? { ...m, receipts: [{ userId: 'other', readAt: new Date().toISOString() }] } : m
      ));
    });

    const u5 = on('message_deleted', ({ messageId }: any) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeleted: true } : m));
    });

    // Payment confirmed (sent or request accepted)
    const u6 = on('payment_confirmed', ({ messageId, stellarTxId, paymentStatus, netUsdc }: any) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, stellarTxId, paymentStatus, amountUsdc: netUsdc ?? m.amountUsdc } : m
      ));
      sounds.moneyIn();
      toast.success('💚 Malipo yamefanikiwa! / Payment confirmed!');
      setAcceptModal(null);
      setAcceptLoading(false);
    });

    // Request rejected
    const u7 = on('request_rejected', ({ messageId, paymentStatus }: any) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, paymentStatus } : m
      ));
      toast.error('❌ Ombi limekataliwa / Request declined');
      setAcceptModal(null);
    });

    // Payment error
    const u8 = on('payment_error', ({ error }: any) => {
      toast.error(error ?? 'Payment failed');
      setAcceptLoading(false);
      setAcceptModal(null);
    });

    // Money received from REST API (e.g. from /send page) — real-time toast
    const u9 = on('money_received', ({ amount, from, asset }: any) => {
      sounds.moneyIn();
      toast.success(`💚 Umepokea ${asset === 'XLM' ? `${amount} XLM` : `$${Number(amount).toFixed(2)} USDC`} kutoka ${from}`);
    });

    // Deposit confirmed
    const u10 = on('deposit_confirmed', ({ amountUsdc, currency, amountLocal }: any) => {
      sounds.moneyIn();
      toast.success(`💚 Amana imefanikiwa! $${Number(amountUsdc).toFixed(2)} USDC`);
    });

    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); u9(); u10(); };
  }, [on, convId, myId, emit]);

  // ── Send image ─────────────────────────────────────────────────────────────
  async function sendImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }
    setUploadingImg(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API}/api/chat/media/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: form,
      }).then(r => r.json());
      if (!res.success) { toast.error('Upload failed'); return; }
      emit('send_message', {
        conversationId:   convId,
        encryptedContent: '[Image]',
        type:             'IMAGE',
        mediaUrl:         res.data.mediaUrl,
        mediaThumbUrl:    res.data.mediaThumbUrl,
        mediaMimeType:    res.data.mimeType,
      });
      scrollToBottom();
    } catch { toast.error('Upload failed'); }
    finally {
      setUploadingImg(false);
      if (imgRef.current) imgRef.current.value = '';
    }
  }

  // ── Send text message ──────────────────────────────────────────────────────
  function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    setMessages(prev => [...prev, {
      id: `temp_${Date.now()}`, conversationId: convId, senderId: myId,
      type: 'TEXT', plainContent: trimmed, encryptedContent: trimmed,
      isDeleted: false, deliveredAt: null, createdAt: new Date().toISOString(), receipts: [],
    }]);
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

  // ── Accept/Reject handlers ────────────────────────────────────────────────
  function handleAccept(messageId: string, amount: number) {
    setAcceptModal({ messageId, amount });
  }

  function handleAcceptConfirm(pin: string) {
    if (!acceptModal) return;
    setAcceptLoading(true);
    emit('pay_request', { messageId: acceptModal.messageId, pin });
    // Response comes via 'payment_confirmed' or 'payment_error' socket events
  }

  function handleReject(messageId: string) {
    emit('reject_request', { messageId });
    // UI updates via 'request_rejected' socket event
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
              <Bubble key={msg.id} msg={msg} isMine={msg.senderId === myId}
                onAccept={handleAccept} onReject={handleReject} />
            ))}
            {isTyping && (
              <div className="flex items-center px-4 py-1">
                <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm flex gap-1.5">
                  {[0, 1, 2].map(i => (
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

      {/* Input bar */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-2 py-2 flex items-end gap-2">
        <button onClick={() => imgRef.current?.click()} disabled={uploadingImg}
          className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 mb-0.5">
          {uploadingImg
            ? <Loader2 size={16} className="animate-spin text-slate-400" />
            : <ImageIcon size={16} className="text-slate-500" />}
        </button>
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={sendImage} />

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

      {/* Accept payment PIN modal */}
      {acceptModal && (
        <AcceptPayModal
          amount={acceptModal.amount}
          loading={acceptLoading}
          onConfirm={handleAcceptConfirm}
          onClose={() => { setAcceptModal(null); setAcceptLoading(false); }}
        />
      )}

      {/* Send / Request money sheet */}
      {showMoney && (
        <MoneySheet
          name={name}
          recipientId={other?.id}
          convId={convId}
          onClose={() => setShowMoney(false)}
          onSent={() => { setShowMoney(false); scrollToBottom(); }}
          emit={emit}
        />
      )}
    </div>
  );
}

// ── Send / Request Money bottom sheet ─────────────────────────────────────────
function MoneySheet({ name, recipientId, convId, onClose, onSent, emit }: any) {
  const [amount, setAmount]   = useState('');
  const [note,   setNote]     = useState('');
  const [pin,    setPin]      = useState('');
  const [step,   setStep]     = useState<'amount' | 'pin'>('amount');
  const [req,    setReq]      = useState(false);
  const [busy,   setBusy]     = useState(false);

  function doSend() {
    if (req) {
      emit('payment_request', {
        conversationId: convId,
        amountUsdc:     parseFloat(amount),
        encryptedNote:  note || null,
      });
      toast.success('💛 Ombi limetumwa / Request sent!');
    } else {
      setBusy(true);
      emit('send_payment', {
        conversationId: convId,
        amountUsdc:     parseFloat(amount),
        encryptedNote:  note || null,
        recipientId,
        pin,
      });
      // Success/error come via socket events — handled in ChatThread
      setTimeout(() => setBusy(false), 15_000); // auto-reset after 15s
    }
    onSent();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-t-3xl px-5 pt-4 pb-10">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">
            {req ? `💛 Omba kutoka ${name}` : `💸 Tuma kwa ${name}`}
          </h3>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>

        {/* Send / Request toggle */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => { setReq(false); setStep('amount'); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${
              !req ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
            }`}>
            💸 Send
          </button>
          <button onClick={() => { setReq(true); setStep('amount'); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${
              req ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'
            }`}>
            💛 Request
          </button>
        </div>

        {step === 'amount' && (
          <div className="space-y-3">
            <input
              type="number" inputMode="decimal" placeholder="0.00 USDC" value={amount}
              onChange={e => setAmount(e.target.value)} autoFocus
              className="w-full text-3xl font-bold text-center bg-slate-50 dark:bg-slate-800 rounded-2xl py-4 outline-none border-2 border-transparent focus:border-primary" />
            <input
              type="text" placeholder="Note / Maelezo (optional)" value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 text-sm outline-none" />

            {/* Fee note for sends */}
            {!req && parseFloat(amount) > 0 && (
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-2.5 space-y-1">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>You send</span><span>{formatUsdc(parseFloat(amount))}</span>
                </div>
                <div className="flex justify-between text-xs text-amber-600">
                  <span>Fee (1%)</span><span>−{formatUsdc(parseFloat(amount) * 0.01)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold border-t pt-1.5 text-green-600">
                  <span>They receive</span><span>{formatUsdc(parseFloat(amount) * 0.99)}</span>
                </div>
              </div>
            )}

            <button
              onClick={() => req ? doSend() : setStep('pin')}
              disabled={!(parseFloat(amount) > 0)}
              className="w-full py-4 rounded-2xl font-bold text-white bg-primary disabled:opacity-40">
              {req ? `Request ${formatUsdc(parseFloat(amount) || 0)}` : `Continue →`}
            </button>
          </div>
        )}

        {step === 'pin' && !req && (
          <div className="flex flex-col items-center gap-4">
            <div className="text-center">
              <p className="font-bold text-lg">{formatUsdc(parseFloat(amount))}</p>
              <p className="text-slate-500 text-sm">to {name}</p>
              <p className="text-xs text-slate-400">They receive {formatUsdc(parseFloat(amount) * 0.99)}</p>
            </div>
            <p className="text-slate-500 text-sm">Enter PIN to confirm</p>
            <PinInput value={pin} onChange={setPin} autoFocus />
            <button
              onClick={doSend}
              disabled={pin.length < 6 || busy}
              className="w-full py-4 rounded-2xl font-bold text-white bg-primary disabled:opacity-40 flex items-center justify-center gap-2">
              {busy
                ? <><Loader2 size={16} className="animate-spin" /> Sending…</>
                : `Send ${formatUsdc(parseFloat(amount))}`}
            </button>
            <button onClick={() => setStep('amount')} className="text-sm text-slate-400">← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
