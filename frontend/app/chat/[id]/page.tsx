'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Send, DollarSign, Check, CheckCheck, X,
  Loader2, ImageIcon, CheckCircle2, XCircle,
  Reply, CornerUpRight, Trash2, Copy, CheckSquare, MessageSquare,
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

// Shared, app-wide notification sounds (rich celebratory money-in, etc.)
import { sounds } from '../../../lib/sounds';

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
  onAccept: (messageId: string, amount: number, asset?: string) => void;
  onReject: (messageId: string) => void;
}) {
  const confirmed = msg.paymentStatus === 'CONFIRMED';
  const failed    = msg.paymentStatus === 'FAILED';
  const pending   = msg.paymentStatus === 'PENDING';
  const isRequest = msg.type === 'PAYMENT_REQUEST';
  const fmtAmt    = (n: number) => formatUsdc(n);  // single-balance: always $

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
            {fmtAmt(msg.amountUsdc ?? 0)}
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
              <span className="text-[10px] text-slate-400 font-mono">
                Ref {String(msg.stellarTxId).slice(0, 8).toUpperCase()}
              </span>
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
              onClick={() => onAccept(msg.id, msg.amountUsdc, msg.paymentAsset)}
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
  onAccept: (messageId: string, amount: number, asset?: string) => void;
  onReject: (messageId: string) => void;
}) {
  const [hearts, setHearts] = useState<number[]>([]);
  const inAnim = isMine ? 'msg-in-right' : 'msg-in-left';
  function react() {
    const id = Date.now();
    setHearts(h => [...h, id]);
    setTimeout(() => setHearts(h => h.filter(x => x !== id)), 1000);
  }

  if (msg.isDeleted) return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-0.5 px-3`}>
      <p className="italic text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-2xl">
        Ujumbe umefutwa
      </p>
    </div>
  );

  if (msg.type === 'SYSTEM') return (
    <div className="flex justify-center my-4">
      <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-white/70 dark:bg-white/5 backdrop-blur px-4 py-1.5 rounded-full border border-slate-200/60 dark:border-white/10">
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
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1 px-3 ${inAnim}`}>
      <div onDoubleClick={react}
        className={`group relative max-w-[78%] select-none px-3.5 py-2 shadow-sm transition-transform active:scale-[0.98] ${
        isMine
          ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl rounded-br-md shadow-blue-500/20'
          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-2xl rounded-bl-md border border-slate-100 dark:border-white/10'
      }`}>
        {/* floating hearts on double-tap */}
        {hearts.map(id => (
          <span key={id} className="heart-float pointer-events-none absolute -top-2 right-2 text-base">❤️</span>
        ))}
        {/* quoted reply context */}
        {msg.replyTo && (
          <div className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs ${
            isMine ? 'border-white/60 bg-white/15 text-white/90' : 'border-blue-400 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300'
          }`}>
            <p className="line-clamp-2 break-words">
              {msg.replyTo.type === 'IMAGE' ? '📷 Photo'
                : msg.replyTo.type === 'PAYMENT' ? '💸 Payment'
                : (msg.replyTo.encryptedContent ?? msg.replyTo.plainContent ?? 'Message')}
            </p>
          </div>
        )}
        <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{text}</p>
        <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-[10px] ${isMine ? 'text-white/70' : 'text-slate-400'}`}>
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
  amount, asset, onConfirm, onClose, loading,
}: {
  amount:    number;
  asset?:    string;
  onConfirm: (pin: string) => void;
  onClose:   () => void;
  loading:   boolean;
}) {
  const [pin, setPin] = useState('');
  const fmtAmt = (n: number) => formatUsdc(n);  // single-balance: always $
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex flex-col justify-end h-app-vh">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md mx-auto max-h-full overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl px-5 pt-5 pb-10 space-y-5">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto" />
        <div className="text-center">
          <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={32} className="text-green-500" />
          </div>
          <h3 className="font-bold text-lg">Confirm Payment</h3>
          <p className="text-slate-500 text-sm mt-1">
            You are about to send <strong>{fmtAmt(amount)}</strong>
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
            : `Pay ${fmtAmt(amount)}`}
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
  const [acceptModal,  setAcceptModal]  = useState<{ messageId: string; amount: number; asset?: string } | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);

  // Message management state
  const [selectMode,  setSelectMode]  = useState(false);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [replyTo,     setReplyTo]     = useState<any>(null);
  const [menuMsg,     setMenuMsg]     = useState<any>(null);          // long-press action sheet
  const [deleteIds,   setDeleteIds]   = useState<string[] | null>(null); // delete options sheet
  const [forwardIds,  setForwardIds]  = useState<string[] | null>(null); // forward picker
  const [convList,    setConvList]    = useState<any[]>([]);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const typingRef  = useRef<any>(null);

  // ── Selection helpers ──────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      if (next.size === 0) setSelectMode(false);
      return next;
    });
  }
  function startSelect(id: string) { setSelectMode(true); setSelected(new Set([id])); setMenuMsg(null); }
  function exitSelect() { setSelectMode(false); setSelected(new Set()); }

  const selectedMsgs = () => messages.filter(m => selected.has(m.id));
  const allSelectedMine = () => selectedMsgs().every(m => m.senderId === myId && !m.isDeleted);

  // ── Delete for me (hide locally) ───────────────────────────────────────────
  async function deleteForMe(ids: string[]) {
    setMessages(prev => prev.filter(m => !ids.includes(m.id)));
    setDeleteIds(null); exitSelect();
    await fetch(`${API}/api/chat/messages/hide`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ messageIds: ids }),
    }).catch(() => {});
  }
  // ── Delete for everyone (own messages) ─────────────────────────────────────
  function deleteForEveryone(ids: string[]) {
    ids.forEach(id => emit('delete_message', { messageId: id }));
    setMessages(prev => prev.map(m => ids.includes(m.id) ? { ...m, isDeleted: true } : m));
    setDeleteIds(null); exitSelect();
  }

  // ── Forward ────────────────────────────────────────────────────────────────
  async function openForward(ids: string[]) {
    setMenuMsg(null);
    const r = await api('/conversations');
    if (r.success) setConvList((r.data.conversations ?? []).filter((c: any) => c.id !== convId));
    setForwardIds(ids);
  }
  function confirmForward(targetConvId: string) {
    const toSend = messages.filter(m => forwardIds!.includes(m.id));
    toSend.forEach(m => {
      if (m.type === 'IMAGE') {
        emit('send_message', { conversationId: targetConvId, encryptedContent: '[Image]', type: 'IMAGE', mediaUrl: m.mediaUrl, mediaThumbUrl: m.mediaThumbUrl, mediaMimeType: m.mediaMimeType });
      } else {
        const body = m.plainContent ?? m.encryptedContent ?? '';
        if (body) emit('send_message', { conversationId: targetConvId, encryptedContent: body, type: 'TEXT' });
      }
    });
    toast.success(`Forwarded to ${toSend.length > 0 ? 'chat' : ''}`);
    setForwardIds(null); exitSelect();
  }

  function copyMessage(m: any) {
    navigator.clipboard.writeText(m.plainContent ?? m.encryptedContent ?? '');
    toast.success('Copied'); setMenuMsg(null);
  }

  // Long-press (mobile) to open the action menu
  const holdRef = useRef<any>(null);
  function startHold(m: any) {
    cancelHold();
    holdRef.current = setTimeout(() => { if (!selectMode && !m.isDeleted) setMenuMsg(m); }, 480);
  }
  function cancelHold() { if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; } }
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
    // On every (re)connect, re-join and CATCH UP: re-fetch recent messages so
    // anything sent while we were briefly offline shows up instantly, then mark
    // read. socket.io fires 'connect' on the initial connect and every reconnect.
    const uc = on('connect', () => {
      emit('join_conversation', { conversationId: convId });
      emit('mark_read',         { conversationId: convId });
      api(`/conversations/${convId}/messages?limit=100`).then((mr: any) => {
        if (!mr?.success) return;
        const server: any[] = mr.data.messages ?? [];
        setMessages(prev => {
          // keep any still-unconfirmed optimistic bubbles not yet on the server
          const temps = prev.filter((m: any) =>
            typeof m.id === 'string' && m.id.startsWith('temp_') &&
            !server.some((s: any) => s.senderId === m.senderId &&
              (s.encryptedContent === m.plainContent || s.plainContent === m.plainContent)));
          return [...server, ...temps];
        });
      }).catch(() => {});
    });

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

    // Private confirmation of OUR OWN sent message — swap the optimistic bubble
    // for the saved one (real id + delivered tick). Never rendered as incoming.
    const u0 = on('message_sent', (msg: any) => {
      if (msg.conversationId !== convId) return;
      setMessages(prev => {
        const idx = prev.findIndex(m => typeof m.id === 'string' && m.id.startsWith('temp_') && (
          m.plainContent === msg.encryptedContent || m.plainContent === msg.plainContent ||
          (m.type !== 'TEXT' && m.type === msg.type)
        ));
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = { ...msg, plainContent: prev[idx].plainContent ?? msg.encryptedContent, deliveredAt: msg.deliveredAt ?? new Date().toISOString() };
          return next;
        }
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, { ...msg, plainContent: msg.plainContent ?? msg.encryptedContent }];
      });
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

    // Payment failed — flip the stuck "pending" bubble to FAILED for both sides
    const u11 = on('payment_failed', ({ messageId }: any) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, paymentStatus: 'FAILED' } : m));
    });

    // Money received from REST API (e.g. from /send page) — real-time toast
    const u9 = on('money_received', ({ amount, from }: any) => {
      sounds.moneyIn();
      toast.success(`💚 Umepokea $${Number(amount).toFixed(2)} kutoka ${from}`);
    });

    // Deposit confirmed
    const u10 = on('deposit_confirmed', ({ amountUsdc }: any) => {
      sounds.moneyIn();
      toast.success(`💚 Amana imefanikiwa! $${Number(amountUsdc).toFixed(2)}`);
    });

    return () => { uc(); u0(); u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); u9(); u10(); u11(); };
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
    const rTo = replyTo;
    setText(''); setReplyTo(null);
    setMessages(prev => [...prev, {
      id: `temp_${Date.now()}`, conversationId: convId, senderId: myId,
      type: 'TEXT', plainContent: trimmed, encryptedContent: trimmed,
      replyToId: rTo?.id ?? null,
      replyTo: rTo ? { id: rTo.id, encryptedContent: rTo.plainContent ?? rTo.encryptedContent, senderId: rTo.senderId, type: rTo.type } : null,
      isDeleted: false, deliveredAt: null, createdAt: new Date().toISOString(), receipts: [],
    }]);
    scrollToBottom();
    emit('send_message', { conversationId: convId, encryptedContent: trimmed, type: 'TEXT', replyToId: rTo?.id ?? null });
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
  function handleAccept(messageId: string, amount: number, asset?: string) {
    setAcceptModal({ messageId, amount, asset });
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
    <div className="h-app-vh flex flex-col bg-slate-50 dark:bg-[#0a1120] chat-bg">

      {/* Selection action bar — replaces header in select mode */}
      {selectMode ? (
        <div className="flex-shrink-0 z-30 bg-white/90 dark:bg-[#0b1426]/90 backdrop-blur-xl border-b border-slate-200/60 dark:border-white/10 px-3 py-2.5 flex items-center gap-3">
          <button onClick={exitSelect} className="p-2 -ml-1 rounded-full hover:bg-slate-100 dark:hover:bg-white/10">
            <X size={20} />
          </button>
          <p className="flex-1 font-semibold text-sm">{selected.size} selected</p>
          <button onClick={() => openForward([...selected])} disabled={selected.size === 0}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30" title="Forward">
            <CornerUpRight size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
          <button onClick={() => { const m = selectedMsgs()[0]; if (m && selected.size === 1) { setReplyTo(m); exitSelect(); } }}
            disabled={selected.size !== 1}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30" title="Reply">
            <Reply size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
          <button onClick={() => setDeleteIds([...selected])} disabled={selected.size === 0}
            className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30" title="Delete">
            <Trash2 size={20} className="text-red-500" />
          </button>
        </div>
      ) : (
      <div className="flex-shrink-0 z-20 bg-white/80 dark:bg-[#0b1426]/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-white/10 px-3 py-2.5 flex items-center gap-3">
        <button onClick={() => router.push('/chat')}
          className="p-2 -ml-1 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="relative">
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm ${other?.isOnline ? 'presence-ring' : ''}`}>
            {name.slice(0, 2).toUpperCase()}
          </div>
          {other?.isOnline && (
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-[#0b1426]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate text-slate-800 dark:text-white">{name}</p>
          <p className="text-xs">
            {isTyping ? <span className="text-emerald-500 font-medium">typing…</span> :
             other?.isOnline ? <span className="text-emerald-500">● online</span> :
             other?.lastSeenAt ? <span className="text-slate-400">last seen {timeAgo(other.lastSeenAt)}</span> :
             <span className="text-slate-400">OlomiPay</span>}
          </p>
        </div>
        {/* encrypted badge */}
        <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
          🔒 Encrypted
        </div>
      </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="relative mb-4">
              <div className="anim-glow absolute -inset-3 rounded-full bg-gradient-to-tr from-blue-500/30 to-emerald-500/30 blur-xl" />
              <div className="relative w-20 h-20 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-3xl flex items-center justify-center text-4xl anim-float">👋</div>
            </div>
            <p className="font-bold text-slate-700 dark:text-slate-200">Say hello to {name}</p>
            <p className="text-xs text-slate-400 mt-1">Messages are end-to-end encrypted. Double-tap any message to react ❤️</p>
          </div>
        ) : (
          <>
            {messages.map(msg => {
              const isSel = selected.has(msg.id);
              return (
                <div key={msg.id}
                  className={`relative transition-colors ${selectMode ? 'cursor-pointer' : ''} ${isSel ? 'bg-blue-500/10' : ''}`}
                  onClick={() => { if (selectMode) toggleSelect(msg.id); }}
                  onContextMenu={e => { e.preventDefault(); if (!selectMode && !msg.isDeleted) setMenuMsg(msg); }}
                  onTouchStart={() => startHold(msg)}
                  onTouchEnd={cancelHold}
                  onTouchMove={cancelHold}>
                  {selectMode && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSel ? 'bg-blue-500 border-blue-500' : 'border-slate-300 dark:border-slate-500 bg-white/50'
                      }`}>
                        {isSel && <Check size={12} className="text-white" />}
                      </div>
                    </div>
                  )}
                  <div className={selectMode ? 'pl-9 pointer-events-none' : ''}>
                    <Bubble msg={msg} isMine={msg.senderId === myId}
                      onAccept={handleAccept} onReject={handleReject} />
                  </div>
                </div>
              );
            })}
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

      {/* Reply preview above composer */}
      {replyTo && !selectMode && (
        <div className="flex-shrink-0 z-20 bg-white/80 dark:bg-[#0b1426]/80 backdrop-blur-xl border-t border-slate-200/60 dark:border-white/10 px-3 pt-2 flex items-start gap-2">
          <div className="flex-1 min-w-0 border-l-2 border-blue-500 pl-2.5">
            <p className="text-xs font-semibold text-blue-500">
              Reply to {replyTo.senderId === myId ? 'yourself' : name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {replyTo.type === 'IMAGE' ? '📷 Photo'
                : replyTo.type === 'PAYMENT' ? '💸 Payment'
                : (replyTo.plainContent ?? replyTo.encryptedContent ?? '')}
            </p>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 text-slate-400"><X size={16} /></button>
        </div>
      )}

      {/* Input bar — SOLID composer, stays anchored at the bottom (phone & tablet) */}
      <div className="flex-shrink-0 z-30 bg-white dark:bg-[#0b1426] border-t border-slate-200 dark:border-white/10 px-2.5 py-2.5 flex items-end gap-2"
        style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}>
        {/* Money — prominent gradient */}
        <button onClick={() => setShowMoney(true)}
          className="relative w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/30 active:scale-95 transition-transform">
          <DollarSign size={19} className="text-white" />
        </button>

        {/* Image */}
        <button onClick={() => imgRef.current?.click()} disabled={uploadingImg}
          className="w-11 h-11 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform">
          {uploadingImg
            ? <Loader2 size={17} className="animate-spin text-slate-400" />
            : <ImageIcon size={17} className="text-slate-500 dark:text-slate-300" />}
        </button>
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={sendImage} />

        {/* Text field */}
        <div className="flex-1 bg-slate-100 dark:bg-white/[0.07] rounded-3xl px-4 py-2.5 flex items-end min-h-[44px] border border-transparent focus-within:border-blue-400/40 transition-colors">
          <textarea ref={inputRef} value={text}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Type a message…" rows={1}
            className="flex-1 bg-transparent text-[15px] text-slate-800 dark:text-white outline-none resize-none max-h-32 leading-relaxed placeholder:text-slate-400"
            style={{ minHeight: '22px' }} />
        </div>

        {/* Send */}
        <button onClick={sendMessage} disabled={!text.trim()}
          className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
            text.trim()
              ? 'bg-gradient-to-br from-blue-500 to-emerald-500 text-white shadow-lg shadow-blue-500/30 active:scale-95'
              : 'bg-slate-200 dark:bg-white/10 text-slate-400'
          }`}>
          <Send size={17} />
        </button>
      </div>

      {/* Long-press action menu */}
      {menuMsg && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setMenuMsg(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative rounded-t-3xl bg-white dark:bg-slate-900 p-2 pb-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mx-auto my-2 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
            {[
              { icon: Reply,        label: 'Reply',   on: () => { setReplyTo(menuMsg); setMenuMsg(null); } },
              { icon: CornerUpRight, label: 'Forward', on: () => openForward([menuMsg.id]) },
              { icon: CheckSquare,  label: 'Select',  on: () => startSelect(menuMsg.id) },
              ...(menuMsg.type === 'TEXT' ? [{ icon: Copy, label: 'Copy', on: () => copyMessage(menuMsg) }] : []),
              { icon: Trash2,       label: 'Delete',  danger: true, on: () => { setDeleteIds([menuMsg.id]); setMenuMsg(null); } },
            ].map((a: any) => (
              <button key={a.label} onClick={a.on}
                className={`flex w-full items-center gap-4 rounded-2xl px-5 py-3.5 text-left active:bg-slate-100 dark:active:bg-slate-800 ${a.danger ? 'text-red-500' : 'text-slate-700 dark:text-slate-200'}`}>
                <a.icon size={20} /> <span className="font-medium">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Delete options sheet */}
      {deleteIds && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setDeleteIds(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative rounded-t-3xl bg-white dark:bg-slate-900 p-5 pb-9 shadow-2xl space-y-2" onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
            <p className="text-center font-semibold mb-2">Delete {deleteIds.length > 1 ? `${deleteIds.length} messages` : 'message'}?</p>
            {(() => {
              const sel = messages.filter(m => deleteIds.includes(m.id));
              const canEveryone = sel.length > 0 && sel.every(m => m.senderId === myId && !m.isDeleted);
              return (
                <>
                  {canEveryone && (
                    <button onClick={() => deleteForEveryone(deleteIds)}
                      className="w-full py-3.5 rounded-2xl bg-red-500 text-white font-semibold">
                      Delete for everyone
                    </button>
                  )}
                  <button onClick={() => deleteForMe(deleteIds)}
                    className="w-full py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold">
                    Delete for me
                  </button>
                  <button onClick={() => setDeleteIds(null)}
                    className="w-full py-3 text-sm text-slate-400">Cancel</button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Forward picker */}
      {forwardIds && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setForwardIds(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative rounded-t-3xl bg-white dark:bg-slate-900 p-4 pb-9 shadow-2xl max-h-[70vh] overflow-y-auto thin-scroll" onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
            <p className="font-semibold mb-3 px-1">Forward to…</p>
            {convList.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-6">No other conversations</p>
            ) : convList.map(c => {
              const o = c.otherParticipants?.[0];
              const cn = c.groupName ?? o?.kycName ?? o?.displayName ?? o?.phoneMasked ?? 'Chat';
              return (
                <button key={c.id} onClick={() => confirmForward(c.id)}
                  className="flex w-full items-center gap-3 px-2 py-3 rounded-2xl active:bg-slate-100 dark:active:bg-slate-800 text-left">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {cn.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-medium text-sm">{cn}</span>
                  <CornerUpRight size={16} className="ml-auto text-slate-300" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Accept payment PIN modal */}
      {acceptModal && (
        <AcceptPayModal
          amount={acceptModal.amount}
          asset={acceptModal.asset}
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
  const [amount, setAmount] = useState('');
  const [note,   setNote]   = useState('');
  const [pin,    setPin]    = useState('');
  const [step,   setStep]   = useState<'amount' | 'pin'>('amount');
  const [req,    setReq]    = useState(false);
  const [busy,   setBusy]   = useState(false);
  const asset = 'USDC' as const;   // single USD balance — XLM is never user-facing
  // Idempotency: one stable ref per opened sheet; a retry reuses it so the
  // server never sends a second payment for the same intent.
  const clientRefRef = useRef<string>(
    (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `cr_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );

  const amt = parseFloat(amount) || 0;
  // Single-balance model — money is always shown as USD ($). No asset choice.
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const quick = [1, 5, 10, 20];

  function doSend() {
    if (req) {
      emit('payment_request', { conversationId: convId, amountUsdc: amt, asset, encryptedNote: note || null });
      toast.success('💛 Request sent!');
      onSent();
    } else {
      setBusy(true);
      emit('send_payment', { conversationId: convId, amountUsdc: amt, asset, encryptedNote: note || null, recipientId, pin, clientRef: clientRefRef.current });
      setTimeout(() => { setBusy(false); onSent(); }, 1200);
    }
  }

  const accent = req ? 'amber' : 'blue';

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex flex-col justify-end h-app-vh">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm anim-pop" onClick={onClose} />

      <div className="relative anim-pop w-full max-w-md mx-auto max-h-full overflow-y-auto rounded-t-[2rem] border-t border-white/10 bg-[#0b1426] text-white px-5 pt-3 pb-9 shadow-2xl">
        {/* glow */}
        <div className={`anim-glow pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full blur-3xl ${req ? 'bg-amber-500/20' : 'bg-blue-500/25'}`} />

        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />

        {/* Send / Request segmented toggle */}
        <div className="relative mb-5 flex rounded-2xl bg-white/5 p-1">
          <span className={`absolute inset-y-1 w-[calc(50%-4px)] rounded-xl bg-gradient-to-r ${req ? 'from-amber-500 to-orange-500 translate-x-[calc(100%+4px)]' : 'from-blue-500 to-emerald-500'} transition-transform duration-300`} />
          <button onClick={() => { setReq(false); setStep('amount'); }}
            className={`relative z-10 flex-1 py-2.5 text-sm font-semibold ${!req ? 'text-white' : 'text-slate-400'}`}>
            Send
          </button>
          <button onClick={() => { setReq(true); setStep('amount'); }}
            className={`relative z-10 flex-1 py-2.5 text-sm font-semibold ${req ? 'text-white' : 'text-slate-400'}`}>
            Request
          </button>
        </div>

        {step === 'amount' && (
          <>
            <p className="mb-1 text-center text-xs text-slate-400">
              {req ? `Request from ${name}` : `Send to ${name}`}
            </p>

            {/* Big amount — money is always USD */}
            <div className="mb-4 flex items-baseline justify-center gap-1">
              <span className="text-3xl font-bold text-white/40">$</span>
              <input
                type="number" inputMode="decimal" placeholder="0" value={amount}
                onChange={e => setAmount(e.target.value)} autoFocus
                className="w-40 bg-transparent text-center text-5xl font-extrabold outline-none placeholder:text-white/20" />
            </div>

            {/* Quick chips */}
            <div className="mb-4 grid grid-cols-4 gap-2">
              {quick.map(q => (
                <button key={q} onClick={() => setAmount(String(q))}
                  className={`rounded-xl py-2 text-sm font-semibold transition-colors ${
                    amt === q ? 'bg-white/15 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}>
                  ${q}
                </button>
              ))}
            </div>

            {/* Note */}
            <input
              type="text" placeholder="Add a note (optional)" value={note}
              onChange={e => setNote(e.target.value)}
              className="mb-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-blue-400/50" />

            {/* Fee line for sends */}
            {!req && amt > 0 && (
              <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm">
                <span className="text-slate-400">{name} receives</span>
                <span className="font-bold text-emerald-400">{fmt(amt * 0.99)}</span>
              </div>
            )}

            <button
              onClick={() => req ? doSend() : setStep('pin')}
              disabled={amt <= 0}
              className="cta-glow flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-emerald-500 py-4 text-base font-bold shadow-xl transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100">
              {req ? `Request ${fmt(amt)}` : `Continue · ${fmt(amt)}`}
            </button>
          </>
        )}

        {step === 'pin' && !req && (
          <div className="flex flex-col items-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-extrabold">{fmt(amt)}</p>
              <p className="text-sm text-slate-400">to {name}</p>
              <p className="text-xs text-emerald-400 mt-0.5">they receive {fmt(amt * 0.99)}</p>
            </div>
            <p className="text-sm text-slate-400">Enter PIN to confirm</p>
            <div className="[&_input]:!bg-white/5 [&_input]:!border-white/10 [&_input]:!text-white">
              <PinInput value={pin} onChange={setPin} autoFocus />
            </div>
            <button
              onClick={doSend}
              disabled={pin.length < 6 || busy}
              className="cta-glow flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-emerald-500 py-4 text-base font-bold shadow-xl disabled:opacity-40">
              {busy ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : `Send ${fmt(amt)}`}
            </button>
            <button onClick={() => setStep('amount')} className="text-sm text-slate-500">← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
