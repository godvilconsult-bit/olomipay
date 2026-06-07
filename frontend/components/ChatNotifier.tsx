'use client';

/**
 * ChatNotifier — global component mounted in the root layout.
 *
 * When on any page (dashboard, send, savings, etc.) it:
 *  1. Maintains a persistent socket connection
 *  2. Plays a sound when a new chat message arrives
 *  3. Shows a rich pop-up toast with sender name + message preview
 *     → tapping the toast opens the conversation
 *  4. Updates the global unread count (BottomNav + Sidebar badge)
 *  5. Handles payment_request pop-ups with a distinct alert tone
 *
 * It stays silent when the user is already inside that exact conversation.
 */

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { MessageCircle, DollarSign } from 'lucide-react';
import { useSocket } from '../lib/useSocket';
import { chatState } from '../lib/chatState';
import { invalidateWallet } from '../lib/walletStore';

const API = process.env.NEXT_PUBLIC_API_URL;

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt') || '';
}

// ── Shared sound engine (one consistent voice across the whole app) ───────────
import { sounds } from '../lib/sounds';

function playSound(type: 'message' | 'payment' | 'request') {
  if (type === 'payment')      sounds.moneyIn();   // 💰 rich celebratory cha-ching
  else if (type === 'request') sounds.request();   // 💛 friendly ping
  else                         sounds.message();   // 💬 light chime
}

// ── Toast pop-up component ────────────────────────────────────────────────────

function MessageToast({
  t, senderName, preview, onOpen,
}: { t: any; senderName: string; preview: string; onOpen: () => void }) {
  return (
    <div
      onClick={() => { toast.dismiss(t.id); onOpen(); }}
      className={`flex items-start gap-3 max-w-sm w-full bg-white dark:bg-slate-800 shadow-lg rounded-2xl p-3.5 cursor-pointer border border-slate-100 dark:border-slate-700 transition-all ${
        t.visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
      style={{ pointerEvents: 'auto' }}
    >
      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
        <MessageCircle size={18} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{senderName}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{preview}</p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); toast.dismiss(t.id); }}
        className="text-slate-300 hover:text-slate-500 flex-shrink-0 text-lg leading-none -mt-0.5"
      >×</button>
    </div>
  );
}

function PaymentToast({
  t, senderName, amount, isRequest, onOpen,
}: { t: any; senderName: string; amount: string; isRequest: boolean; onOpen: () => void }) {
  return (
    <div
      onClick={() => { toast.dismiss(t.id); onOpen(); }}
      className={`flex items-start gap-3 max-w-sm w-full bg-white dark:bg-slate-800 shadow-lg rounded-2xl p-3.5 cursor-pointer border-2 ${
        isRequest ? 'border-amber-300' : 'border-green-300'
      } transition-all ${t.visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
        isRequest ? 'bg-amber-100' : 'bg-green-100'
      }`}>
        <DollarSign size={18} className={isRequest ? 'text-amber-600' : 'text-green-600'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-slate-900 dark:text-white">
          {isRequest ? '💛 Payment Request' : '💚 Money Received'}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
          {isRequest ? `${senderName} requests ${amount}` : `${senderName} sent you ${amount}`}
        </p>
        {isRequest && (
          <p className="text-[10px] text-amber-600 mt-1 font-semibold">Tap to Accept or Decline →</p>
        )}
      </div>
      <button
        onClick={e => { e.stopPropagation(); toast.dismiss(t.id); }}
        className="text-slate-300 hover:text-slate-500 flex-shrink-0 text-lg leading-none -mt-0.5"
      >×</button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ChatNotifier() {
  const path   = usePathname();
  const router = useRouter();
  const token  = typeof window !== 'undefined' ? getToken() : null;
  const { on } = useSocket(token);

  // Track which conversation ID we're currently viewing
  const currentConvId = path.startsWith('/chat/') ? path.split('/')[2] : null;
  // Remember message ids we've already shown a pop-up for (dedup)
  const seenIds = useRef<Set<string>>(new Set());

  // Fetch initial unread count on mount
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/chat/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(r => {
        if (r.success) {
          const total = (r.data.conversations ?? []).reduce(
            (sum: number, c: any) => sum + (c.unreadCount ?? 0), 0
          );
          chatState.setUnread(total);
        }
      })
      .catch(() => {});
  }, [token]);

  // Clear unread when entering /chat (list page)
  useEffect(() => {
    if (path === '/chat') chatState.clear();
  }, [path]);

  // Socket event handlers
  useEffect(() => {
    if (!token) return;

    // ── Incoming chat message ─────────────────────────────────────────────
    const u1 = on('new_message', (msg: any) => {
      // Dedup: never react to the same message id twice (guards against any
      // duplicate socket delivery → a single message = a single pop-up).
      if (msg?.id) {
        if (seenIds.current.has(msg.id)) return;
        seenIds.current.add(msg.id);
        if (seenIds.current.size > 200) seenIds.current = new Set([...seenIds.current].slice(-100));
      }
      // Skip if we're already viewing this exact conversation
      if (msg.conversationId === currentConvId) return;
      // Skip system messages
      if (msg.type === 'SYSTEM') return;
      // Skip our own messages (optimistic). Decode base64URL safely — plain
      // atob() throws on JWT '-'/'_' chars, which would let own messages through.
      try {
        let s = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        const myId = JSON.parse(atob(s))?.userId;
        if (msg.senderId === myId) return;
      } catch {}

      // Update unread badge
      chatState.increment();

      // Determine message preview text
      const senderName = msg.sender?.kycName ?? msg.sender?.phoneMasked ?? 'Someone';
      const preview =
        msg.type === 'PAYMENT'         ? `💸 Sent you $${(msg.amountUsdc ?? 0).toFixed(2)}`
        : msg.type === 'PAYMENT_REQUEST' ? `💛 Requesting $${(msg.amountUsdc ?? 0).toFixed(2)}`
        : msg.type === 'IMAGE'           ? '🖼 Sent an image'
        : msg.plainContent ?? msg.encryptedContent
          ? '🔒 New message'
          : '🔒 New message';

      // Play appropriate sound
      if (msg.type === 'PAYMENT')          playSound('payment');
      else if (msg.type === 'PAYMENT_REQUEST') playSound('request');
      else                                  playSound('message');

      // Show pop-up toast
      if (msg.type === 'PAYMENT' || msg.type === 'PAYMENT_REQUEST') {
        toast.custom(
          t => (
            <PaymentToast
              t={t}
              senderName={senderName}
              amount={`$${(msg.amountUsdc ?? 0).toFixed(2)}`}
              isRequest={msg.type === 'PAYMENT_REQUEST'}
              onOpen={() => router.push(`/chat/${msg.conversationId}`)}
            />
          ),
          { duration: 8000, position: 'top-right' }
        );
      } else {
        toast.custom(
          t => (
            <MessageToast
              t={t}
              senderName={senderName}
              preview={preview}
              onOpen={() => router.push(`/chat/${msg.conversationId}`)}
            />
          ),
          { duration: 5000, position: 'top-right' }
        );
      }
    });

    // ── New conversation started with us ──────────────────────────────────
    const u2 = on('new_conversation', (conv: any) => {
      const other = conv.otherParticipants?.[0];
      const name  = other?.kycName ?? other?.displayName ?? 'Someone';
      playSound('message');
      toast.custom(
        t => (
          <MessageToast
            t={t}
            senderName={name}
            preview="Started a conversation with you"
            onOpen={() => router.push(`/chat/${conv.id}`)}
          />
        ),
        { duration: 6000, position: 'top-right' }
      );
    });

    // ── Money received (from send page, not chat) ─────────────────────────
    const u3 = on('money_received', ({ amount, from, asset, conversationId }: any) => {
      playSound('payment');
      invalidateWallet(); // refresh the shared balance everywhere
      const amtStr = `$${Number(amount).toFixed(2)}`;
      toast.custom(
        t => (
          <PaymentToast
            t={t}
            senderName={from ?? 'Someone'}
            amount={amtStr}
            isRequest={false}
            onOpen={() => router.push(conversationId ? `/chat/${conversationId}` : '/history')}
          />
        ),
        { duration: 6000, position: 'top-right' }
      );
    });

    // ── Deposit confirmed ─────────────────────────────────────────────────
    const u4 = on('deposit_confirmed', ({ amountUsdc, amountLocal, currency }: any) => {
      playSound('payment');
      invalidateWallet(); // money in → refresh the shared balance
      toast.custom(
        t => (
          <PaymentToast
            t={t}
            senderName="OlomiPay"
            amount={`$${Number(amountUsdc).toFixed(2)}`}
            isRequest={false}
            onOpen={() => router.push('/history')}
          />
        ),
        { duration: 6000, position: 'top-right' }
      );
    });

    return () => { u1(); u2(); u3(); u4(); };
  }, [on, token, currentConvId, router]);

  return null; // renders nothing — purely reactive
}
