'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Gift, Share2, Copy, Star, Users } from 'lucide-react';
import { referrals } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { Card, Button, Spinner, Money, Stat } from '../../components/ui';

export default function InvitePage() {
  const router = useRouter();
  const { t } = useT();
  const [data, setData] = useState<Awaited<ReturnType<typeof referrals.me>> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => referrals.me().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!data) return <div className="min-h-screen bg-sand"><Spinner /></div>;

  const link = typeof window !== 'undefined' ? `${window.location.origin}/auth/register?ref=${data.code}` : '';
  const msg = t(`Get cooking gas delivered with JIKO CONNECT! Use my code ${data.code} and we both earn a bonus: ${link}`,
                `Pata gesi ya kupikia kwa JIKO CONNECT! Tumia namba yangu ${data.code} tupate bonasi sote: ${link}`);

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: 'JIKO CONNECT', text: msg });
      else { await navigator.clipboard.writeText(msg); toast.success(t('Invite copied', 'Mwaliko umenakiliwa')); }
    } catch { /* user cancelled */ }
  }
  async function redeem() {
    setBusy(true);
    try {
      const r = await referrals.redeem(data!.loyaltyPoints);
      toast.success(`${t('Redeemed', 'Umebadilisha')} — +TZS ${r.credited.toLocaleString()}`);
      load();
    } catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); }
  }

  const canRedeem = data.loyaltyPoints >= data.minRedeem;

  return (
    <div className="min-h-screen bg-sand pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/90 px-4 py-3 backdrop-blur">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">{t('Invite & rewards', 'Alika & zawadi')}</h1>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        {/* referral code */}
        <div className="rounded-ds-xl bg-grad-brand p-5 text-white shadow-ds-card">
          <div className="flex items-center gap-2 text-sm font-medium text-white/80"><Gift size={16} /> {t('Your invite code', 'Namba yako ya mwaliko')}</div>
          <div className="mt-1 text-3xl font-extrabold tracking-[.2em]">{data.code}</div>
          <p className="mt-1 text-xs text-white/80">{t('Friends who sign up with your code earn you both a wallet bonus on their first order.', 'Rafiki anayejisajili na namba yako mnapata bonasi sote kwa oda yake ya kwanza.')}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={share} className="!bg-white !text-flame"><Share2 size={16} /> {t('Share', 'Sambaza')}</Button>
            <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(link); toast.success(t('Link copied', 'Kiungo kimenakiliwa')); }} className="!bg-white/15 !text-white"><Copy size={16} /> {t('Copy link', 'Nakili')}</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Stat label={t('Friends invited', 'Walioalikwa')} value={<span className="inline-flex items-center gap-1"><Users size={16} />{data.invited}</span>} />
          <Stat label={t('Bonuses earned', 'Bonasi')} value={data.rewarded} accent />
        </div>

        {/* loyalty */}
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 font-bold"><Star size={16} className="fill-ember text-ember" /> {t('Loyalty points', 'Pointi za uaminifu')}</div>
              <div className="mt-0.5 text-sm text-ink/50">{data.loyaltyPoints} {t('points', 'pointi')} · ≈ <Money value={data.loyaltyPoints * data.redeemRate} className="text-xs" /></div>
            </div>
            <Button variant="primary" disabled={!canRedeem} loading={busy} onClick={redeem} className="!px-3.5">{t('Redeem', 'Badilisha')}</Button>
          </div>
          {!canRedeem && <p className="mt-2 border-t border-black/5 pt-2 text-xs text-ink/40">{t(`Earn ${data.minRedeem} points to redeem. You get points on every completed order.`, `Pata pointi ${data.minRedeem} kubadilisha. Unapata pointi kila oda inayokamilika.`)}</p>}
        </Card>
      </div>
    </div>
  );
}
