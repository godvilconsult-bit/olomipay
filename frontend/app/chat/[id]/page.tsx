'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Send, Paperclip, DollarSign, Check, CheckCheck, X, Loader2 } from 'lucide-react';
import { useSocket } from '../../../lib/useSocket';
import { ChatEncryption, getMySecretKey } from '../../../lib/chatEncryption';
import { formatUsdc, formatTzs, timeAgo } from '../../../lib/utils';
import PinInput from '../../../components/PinInput';

function getToken() {
  return sessionStorage.getItem('olomipay_at') || sessionStorage.getItem('olomipay_rt') || '';
}

async function chatApi(path: string, method = 'GET', body?: any) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chat${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

type Message = {
  id:              string;
  conversationId:  string;
  senderId:        string;
  type:            string;
  encryptedContent?: string;
  plainContent?:   string;
  decryptedText?:  string;
  amountUsdc?:     number;
  amountTzs?:      number;
  stellarTxId?:    string;
  paymentStatus?:  string;
  paymentNote?:    string;
  mediaUrl?:       string;
  mediaThumbUrl?:  string;
  replyToId?:      string;
  isDeleted:       boolean;
  createdAt:       string;
  sender?:         { id: string; kycName?: string; chatPublicKey?: string };
  receipts?:       { userId: string; readAt: string }[];
};

// ── Message Bubble ─────────────────────────────────────────────────────────────
function MessageBubble({
  msg, isMine, myId, otherPubKey, onReply, onDelete, onPayRequest,
}: {
  msg: Message; isMine: boolean; myId: string; otherPubKey?: string;
  onReply: (m: Message) => void; onDelete: (id: string) => void; onPayRequest: () => void;
}) {
  const isRead = msg.receipts?.some(r => r.userId !== myId);

  if (msg.isDeleted) {
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1`}>
        <p className="text-xs text-slate-400 italic px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-2xl">
          Ujumbe umefutwa
        </p>
      </div>
    );
  }

  if (msg.type === 'SYSTEM') {
    return (
      <div className="flex justify-center my-3">
        <p className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-4 py-1.5 rounded-full">
          {msg.plainContent}
        </p>
      </div>
    );
  }

  if (msg.type === 'PAYMENT' || msg.type === 'PAYMENT_REQUEST') {
    const isPending   = msg.paymentStatus === 'PENDING';
    const isConfirmed = msg.paymentStatus === 'CONFIRMED';
    const isFailed    = msg.paymentStatus === 'FAILED';

    return (
      <div className="flex justify-center my-3 px-5">
        <div className={`w-full max-w-xs rounded-3xl overflow-hidden shadow-sm border ${
          isConfirmed ? 'border-success/20' : isFailed ? 'border-danger/20' : 'border-amber-200'
        } bg-white dark:bg-slate-800`}>
          <div className={`px-4 py-3 ${
            isConfirmed ? 'bg-success/5' : isFailed ? 'bg-danger/5' : 'bg-amber-50 dark:bg-amber-900/20'
          }`}>
            <p className="text-xs font-semibold text-slate-500 mb-1">
              {msg.type === 'PAYMENT_REQUEST'
                ? (isMine ? '💛 Uliomba' : '💛 Ombi la malipo')
                : (isMine ? '💸 Ulituma' : '💚 Ulipokea')}
            </p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">
              {formatUsdc(msg.amountUsdc ?? 0)}
            </p>
            <p className="text-xs text-slate-400">= {formatTzs(msg.amountTzs ?? 0)}</p>
          </div>
          <div className="px-4 py-3 space-y-2">
            {msg.paymentNote && (
              <p className="text-sm text-slate-500 italic">"{msg.paymentNote}"</p>
            )}
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${
                isConfirmed ? 'text-success' : isFailed ? 'text-danger' : 'text-amber-600'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  isConfirmed ? 'bg-success' : isFailed ? 'bg-danger' : 'bg-amber-400'
                }`} />
                {isPending ? 'Inasubiri...' : isConfirmed ? 'Imethibitishwa' : 'Imeshindwa'}
              </div>
              {msg.stellarTxId && (
                <a href={`https://stellar.expert/explorer/testnet/tx/${msg.stellarTxId}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary underline">
                  Stellar ↗
                </a>
              )}
            </div>
            {msg.type === 'PAYMENT_REQUEST' && !isMine && msg.paymentStatus === 'PENDING' && (
              <button onClick={onPayRequest}
                className="w-full bg-primary text-white text-sm py-2 rounded-2xl font-semibold mt-1">
                Lipa {formatUsdc(msg.amountUsdc ?? 0)} sasa
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (msg.type === 'IMAGE' && msg.mediaThumbUrl) {
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1 px-4`}>
        <div className="relative">
          <img src={msg.mediaThumbUrl} alt="Image" className="w-48 h-48 object-cover rounded-2xl cursor-pointer"
            onClick={() => window.open(msg.mediaUrl, '_blank')} />
        </div>
      </div>
    );
  }

  // TEXT bubble
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1 px-4`}>
      <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`px-4 py-2.5 rounded-3xl ${
          isMine
            ? 'bg-primary text-white rounded-br-sm'
            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm shadow-sm'
        }`}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {msg.decryptedText ?? msg.plainContent ?? '🔒'}
          </p>
        </div>
        <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'flex-row-reverse' : ''}`}>
          <p className="text-[10px] text-slate-400">{timeAgo(msg.createdAt)}</p>
          {isMine && (
            isRead
              ? <CheckCheck size={12} className="text-primary" />
              : <Check size={12} className="text-slate-400" />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Send Money Sheet ───────────────────────────────────────────────────────────
function SendMoneySheet({ recipientName, recipientId, conversationId, onClose, onSent, emit }: any) {
  const [amount, setAmount]   = useState('');
  const [note,   setNote]     = useState('');
  const [pin,    setPin]      = useState('');
  const [step,   setStep]     = useState<'amount'|'pin'>('amount');
  const [loading,setLoading]  = useState(false);
  const [isRequest, setIsRequest] = useState(false);

  function handleSend() {
    if (isRequest) {
      emit('payment_request', {
        conversationId,
        amountUsdc: parseFloat(amount),
        encryptedNote: note || null,
      });
    } else {
      emit('send_payment', {
        conversationId,
        amountUsdc:    parseFloat(amount),
        encryptedNote: note || null,
        recipientId,
        pin,
      });
    }
    onSent();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-t-3xl px-5 pt-5 pb-10">
        <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-5" />
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">
            {isRequest ? `Omba pesa kutoka ${recipientName}` : `Tuma pesa kwa ${recipientName}`}
          </h3>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setIsRequest(false)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium ${!isRequest ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}>
            Tuma
          </button>
          <button onClick={() => setIsRequest(true)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium ${isRequest ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
            Omba
          </button>
        </div>

        {step === 'amount' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Kiasi (USDC)</label>
              <input type="number" placeholder="0.00" value={amount}
                onChange={e => setAmount(e.target.value)}
                className="input text-3xl font-bold" autoFocus />
            </div>
            {parseFloat(amount) > 0 && (
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-3 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>{recipientName} atapokea</span>
                  <span className="font-semibold text-success">{formatUsdc(parseFloat(amount) * 0.99)}</span>
                </div>
                <div className="flex justify-between text-slate-400 text-xs mt-1">
                  <span>Ada ya Tuma (1%)</span>
                  <span>{formatUsdc(parseFloat(amount) * 0.01)}</span>
                </div>
              </div>
            )}
            <input type="text" placeholder="Ongeza maelezo (hiari)" value={note}
              onChange={e => setNote(e.target.value)} className="input text-sm" />
            <button onClick={() => isRequest ? handleSend() : setStep('pin')}
              disabled={parseFloat(amount) <= 0}
              className={`w-full py-4 rounded-2xl font-bold text-white ${isRequest ? 'bg-amber-500' : 'bg-primary'}`}>
              {isRequest ? `Omba ${formatUsdc(parseFloat(amount) || 0)}` : 'Endelea'}
            </button>
          </div>
        )}

        {step === 'pin' && !isRequest && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-slate-500 text-sm">Ingiza nambari ya siri</p>
            <PinInput value={pin} onChange={setPin} autoFocus />
            <button onClick={handleSend} disabled={pin.length < 6 || loading}
              className="btn-primary w-full bg-primary">
              {loading ? 'Inatuma...' : `Tuma ${formatUsdc(parseFloat(amount))}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Chat Thread ───────────────────────────────────────────────────────────
export default function ChatThreadPage() {
  const { id: conversationId } = useParams() as { id: string };
  const router   = useRouter();
  const token    = typeof window !== 'undefined' ? sessionStorage.getItem('olomipay_rt') : null;
  const { emit, on } = useSocket(token);

  const [messages,    setMessages]    = useState<Message[]>([]);
  const [conversation, setConversation] = useState<any>(null);
  const [text,        setText]        = useState('');
  const [typing,      setTyping]      = useState(false);
  const [isTyping,    setIsTyping]    = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [showMoney,   setShowMoney]   = useState(false);
  const [replyTo,     setReplyTo]     = useState<Message | null>(null);
  const [myId,        setMyId]        = useState('');
  const [otherUser,   setOtherUser]   = useState<any>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const typingTimer  = useRef<any>(null);

  // Get current user ID from token
  useEffect(() => {
    const tok = sessionStorage.getItem('olomipay_rt');
    if (!tok) return;
    try {
      const payload = JSON.parse(atob(tok.split('.')[1]));
      setMyId(payload.userId ?? '');
    } catch {}
  }, []);

  // Load conversation + messages
  useEffect(() => {
    if (!conversationId) return;

    chatApi(`/conversations`).then(r => {
      if (r.success) {
        const conv = r.data.conversations.find((c: any) => c.id === conversationId);
        if (conv) {
          setConversation(conv);
          const other = conv.otherParticipants?.[0];
          setOtherUser(other);
        }
      }
    });

    chatApi(`/conversations/${conversationId}/messages`).then(r => {
      if (r.success) {
        const decrypted = r.data.messages.map(decryptMessage);
        setMessages(decrypted);
        setLoading(false);
        scrollToBottom();
      }
    });

    emit('join_conversation', { conversationId });
    chatApi(`/conversations/${conversationId}/read`, 'POST');
  }, [conversationId]);

  function decryptMessage(msg: Message): Message {
    if (msg.type !== 'TEXT' || !msg.encryptedContent) return msg;
    const secretKey = getMySecretKey();
    const senderPubKey = msg.sender?.chatPublicKey;
    if (!secretKey || !senderPubKey) return { ...msg, decryptedText: '🔒 Nambari ya siri inahitajika' };
    const decrypted = ChatEncryption.decrypt(msg.encryptedContent, senderPubKey, secretKey);
    return { ...msg, decryptedText: decrypted ?? '🔒 Imesimbwa' };
  }

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  // Socket subscriptions
  useEffect(() => {
    const unsub1 = on('new_message', (msg: Message) => {
      if (msg.conversationId !== conversationId) return;
      setMessages(prev => [...prev, decryptMessage(msg)]);
      scrollToBottom();
      emit('mark_read', { conversationId });
    });

    const unsub2 = on('payment_confirmed', ({ messageId, stellarTxId, paymentStatus }: any) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, stellarTxId, paymentStatus } : m));
    });

    const unsub3 = on('payment_failed', ({ messageId }: any) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, paymentStatus: 'FAILED' } : m));
    });

    const unsub4 = on('typing', ({ userId }: any) => {
      if (userId !== myId) setIsTyping(true);
    });

    const unsub5 = on('stopped_typing', () => setIsTyping(false));

    const unsub6 = on('messages_read', ({ messageIds }: any) => {
      setMessages(prev => prev.map(m =>
        messageIds.includes(m.id) ? { ...m, receipts: [{ userId: 'other', readAt: new Date().toISOString() }] } : m
      ));
    });

    const unsub7 = on('message_deleted', ({ messageId }: any) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeleted: true } : m));
    });

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); };
  }, [on, conversationId, myId]);

  function handleTyping() {
    if (!typing) { emit('typing_start', { conversationId }); setTyping(true); }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      emit('typing_stop', { conversationId });
      setTyping(false);
    }, 2_000);
  }

  async function sendMessage() {
    if (!text.trim()) return;
    const plaintext = text.trim();
    setText('');
    emit('typing_stop', { conversationId });

    // Encrypt if we have the key
    const secretKey = getMySecretKey();
    const recipientPubKey = otherUser?.chatPublicKey;
    let encryptedContent: string | undefined;

    if (secretKey && recipientPubKey) {
      encryptedContent = ChatEncryption.encrypt(plaintext, recipientPubKey, secretKey);
    }

    emit('send_message', {
      conversationId,
      encryptedContent: encryptedContent ?? plaintext, // fallback: send as "encrypted" placeholder
      type:             'TEXT',
      replyToId:        replyTo?.id ?? null,
    });
    setReplyTo(null);
    scrollToBottom();
  }

  const recipientName = conversation?.groupName ?? otherUser?.kycName ?? otherUser?.phone ?? '...';

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center gap-3 z-40">
        <button onClick={() => router.back()}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-semibold text-sm">
            {recipientName.slice(0, 1).toUpperCase()}
          </div>
          {otherUser?.isOnline && (
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-success rounded-full border-2 border-white" />
          )}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">{recipientName}</p>
          <p className="text-xs text-slate-400">
            {isTyping ? '⌨️ Anaandika...' : otherUser?.isOnline ? 'Mtandaoni' : `Alionekana ${timeAgo(otherUser?.lastSeenAt)}`}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isMine={msg.senderId === myId}
                myId={myId}
                otherPubKey={otherUser?.chatPublicKey}
                onReply={setReplyTo}
                onDelete={(id) => emit('delete_message', { messageId: id })}
                onPayRequest={() => {
                  const pin = prompt('Ingiza nambari ya siri kulipa:');
                  if (pin) emit('pay_request', { messageId: msg.id, pin });
                }}
              />
            ))}
            {isTyping && (
              <div className="flex items-center gap-2 px-4 mb-2">
                <div className="bg-white dark:bg-slate-800 rounded-full px-4 py-2 shadow-sm">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="flex-shrink-0 bg-slate-100 dark:bg-slate-800 px-4 py-2 flex items-center gap-2 border-t border-slate-200 dark:border-slate-700">
          <div className="flex-1 text-xs text-slate-600 dark:text-slate-400 truncate">
            <span className="font-semibold">Jibu: </span>
            {replyTo.decryptedText ?? '🔒'}
          </div>
          <button onClick={() => setReplyTo(null)}><X size={16} className="text-slate-400" /></button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-3 py-3 flex items-end gap-2">
        <button className="p-2 rounded-full text-slate-400 min-h-[40px] min-w-[40px] flex items-center justify-center">
          <Paperclip size={20} />
        </button>
        <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-3xl px-4 py-2.5 flex items-end gap-2">
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); handleTyping(); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Andika ujumbe..."
            rows={1}
            className="flex-1 bg-transparent text-sm outline-none resize-none max-h-32 leading-relaxed"
            style={{ minHeight: '24px' }}
          />
        </div>
        {text.trim() ? (
          <button onClick={sendMessage}
            className="w-10 h-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
            <Send size={18} className="text-white" />
          </button>
        ) : (
          <button onClick={() => setShowMoney(true)}
            className="w-10 h-10 bg-success/10 rounded-full flex items-center justify-center flex-shrink-0">
            <DollarSign size={18} className="text-success" />
          </button>
        )}
      </div>

      {/* Send Money Sheet */}
      {showMoney && (
        <SendMoneySheet
          recipientName={recipientName}
          recipientId={otherUser?.id}
          conversationId={conversationId}
          onClose={() => setShowMoney(false)}
          onSent={() => { setShowMoney(false); scrollToBottom(); }}
          emit={emit}
        />
      )}
    </div>
  );
}
