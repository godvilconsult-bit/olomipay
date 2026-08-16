'use client';

/**
 * "Message seller" — the entry point into a pre-order conversation.
 *
 * Lives in its own client component so the product page around it stays a
 * server component and remains indexable.
 *
 * Signed-out visitors are sent to sign in and returned here afterwards, because
 * a conversation needs two identified organizations. Browsing stays open;
 * only talking requires an account.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { MessageSquare } from 'lucide-react';
import { messaging, getAccessToken, ApiError } from '../lib/api';
import { Button } from './ui';
import { useT } from '../lib/i18n';

export default function ContactSellerButton(
  { productId, productName }: { productId: string; productName: string },
) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  function start() {
    if (!getAccessToken()) {
      router.push(`/auth/login?next=${encodeURIComponent(`/shop/p/${productId}`)}`);
      return;
    }
    setBody(t(`Hello, I'm interested in "${productName}". Is it available?`,
              `Habari, ninavutiwa na "${productName}". Ipo?`));
    setOpen(true);
  }

  async function send() {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      const r = await messaging.start({ productId, body: text });
      router.push(`/messages/${r.conversation.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('Could not start the conversation', 'Imeshindwa kuanza mazungumzo'));
      setSending(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" className="mt-4 w-full" onClick={start}>
        <MessageSquare size={16} /> {t('Message seller', 'Tuma ujumbe kwa muuzaji')}
      </Button>
    );
  }

  return (
    <div className="mt-4 rounded-ds-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-ink-2">
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={3}
        aria-label={t('Your message', 'Ujumbe wako')}
        className="w-full rounded-2xl border border-black/10 bg-white p-3 text-sm text-ink outline-none focus:border-flame dark:border-white/10 dark:bg-ink dark:text-sand"
      />
      <div className="mt-2 flex gap-2">
        <Button className="flex-1" loading={sending} onClick={send}>
          {t('Send', 'Tuma')}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t('Cancel', 'Ghairi')}</Button>
      </div>
    </div>
  );
}
