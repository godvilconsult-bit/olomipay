'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Camera, CreditCard, ShieldCheck, Clock, Upload } from 'lucide-react';
import { kyc, auth, Role } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { Card, Button, Field, Spinner, cn } from '../../components/ui';
import { RoleNav } from '../../components/RoleNav';

// Resize + compress an image file to a small JPEG data URL.
function compress(file: File, max = 900, q = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.onerror = reject; img.src = String(reader.result);
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

export default function KycPage() {
  const router = useRouter();
  const { t } = useT();
  const [status, setStatus] = useState<string | null>(null);
  const [role, setRole]     = useState<Role>('HOUSEHOLD');
  const [form, setForm]     = useState({ name: '', idType: 'NIDA', idNumber: '', vehicleType: 'MOTORBIKE', plateNo: '' });
  const [selfie, setSelfie] = useState<string>('');
  const [idImg, setIdImg]   = useState<string>('');
  const [busy, setBusy]     = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([kyc.status().catch(() => null), auth.me().catch(() => null)]).then(([s, m]) => {
      setStatus(s?.kycStatus ?? 'PENDING');
      if (m?.user) { setRole(m.user.role); setForm((f) => ({ ...f, name: m.user.name ?? '' })); }
      setLoading(false);
    });
  }, []);

  async function pick(e: React.ChangeEvent<HTMLInputElement>, which: 'selfie' | 'id') {
    const f = e.target.files?.[0]; if (!f) return;
    try { const url = await compress(f, which === 'id' ? 1100 : 800); which === 'selfie' ? setSelfie(url) : setIdImg(url); }
    catch { toast.error(t('Could not read image', 'Imeshindwa kusoma picha')); }
  }

  async function submit() {
    if (!form.name || !form.idNumber) return toast.error(t('Fill your name and ID number', 'Jaza jina na namba ya kitambulisho'));
    if (role === 'RIDER' && !form.plateNo) return toast.error(t('Enter your vehicle registration number', 'Weka namba ya usajili wa chombo'));
    if (!selfie) return toast.error(t('Add a selfie photo', 'Weka picha ya uso'));
    if (!idImg) return toast.error(t('Add your ID photo', 'Weka picha ya kitambulisho'));
    setBusy(true);
    try {
      await kyc.submit({ name: form.name, idType: form.idType, idNumber: form.idNumber, selfieUrl: selfie, idUrl: idImg, ...(role === 'RIDER' && { plateNo: form.plateNo, vehicleType: form.vehicleType }) });
      toast.success(t('Submitted — KYC under review', 'Imewasilishwa — KYC inakaguliwa')); router.replace('/dashboard');
    }
    catch (e: any) { toast.error(e?.message ?? t('Failed', 'Imeshindikana')); } finally { setBusy(false); }
  }

  if (loading) return <div className="min-h-screen bg-sand"><Spinner /></div>;

  const Shot = ({ url, on, label, icon, capture }: any) => (
    <label className="block cursor-pointer">
      <span className="mb-1.5 block text-sm font-medium text-ink/70">{label}</span>
      <div className={cn('flex h-40 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed', url ? 'border-leaf/50' : 'border-black/15 bg-white')}>
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <div className="flex flex-col items-center gap-1 text-ink/40">{icon}<span className="text-xs">{t('Tap to take / upload', 'Bonyeza kupiga / pakia')}</span></div>}
      </div>
      <input type="file" accept="image/*" capture={capture} onChange={on} className="hidden" />
    </label>
  );

  return (
    <div className="min-h-screen bg-sand pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/5 bg-sand/90 px-4 py-3 backdrop-blur">
        <button onClick={() => router.replace('/dashboard')} className="grid h-9 w-9 place-items-center rounded-xl bg-black/5"><ArrowLeft size={18} /></button>
        <h1 className="font-extrabold">{t('Identity verification (KYC)', 'Uthibitisho (KYC)')}</h1>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-4">
        {status === 'APPROVED' ? (
          <Card className="border-leaf/40 text-center"><ShieldCheck className="mx-auto text-leaf" size={40} /><p className="mt-2 font-bold">{t('You are verified', 'Umethibitishwa')} ✓</p><p className="mt-1 text-sm text-ink/60">{t('Your verified badge is now active.', 'Beji yako ya uthibitisho iko hai.')}</p></Card>
        ) : status === 'SUBMITTED' ? (
          <Card className="border-warning/40 text-center"><Clock className="mx-auto text-warning" size={40} /><p className="mt-2 font-bold">{t('Under review', 'Inakaguliwa')}</p><p className="mt-1 text-sm text-ink/60">{t('We are checking your documents. You will be notified once approved.', 'Tunakagua nyaraka zako. Utaarifiwa zikikubaliwa.')}</p></Card>
        ) : (
          <>
            <Card className="!bg-flame/5 border-flame/20"><p className="text-sm text-ink/70">{t('Verification is required before you can operate. It takes a minute.', 'Uthibitisho ni lazima kabla ya kuanza. Inachukua dakika moja.')}</p></Card>
            <Card className="space-y-4">
              <Field label={t('Full name (as on ID)', 'Jina kamili (kama kwenye kitambulisho)')} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink/70">{t('ID type', 'Aina ya kitambulisho')}</span>
                  <select value={form.idType} onChange={(e) => setForm((f) => ({ ...f, idType: e.target.value }))} className="w-full min-h-touch rounded-2xl border border-black/15 bg-white px-3 text-ink outline-none focus:border-flame">
                    <option value="NIDA">NIDA</option><option value="PASSPORT">{t('Passport', 'Pasipoti')}</option><option value="LICENSE">{t('Driver license', 'Leseni')}</option><option value="VOTER">{t('Voter ID', 'Mpiga kura')}</option>
                  </select>
                </label>
                <Field label={t('ID number', 'Namba ya kitambulisho')} value={form.idNumber} onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))} />
              </div>
              {role === 'RIDER' && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink/70">{t('Vehicle type', 'Aina ya chombo')}</span>
                    <select value={form.vehicleType} onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))} className="w-full min-h-touch rounded-2xl border border-black/15 bg-white px-3 text-ink outline-none focus:border-flame">
                      <option value="MOTORBIKE">{t('Motorbike', 'Pikipiki')}</option><option value="BAJAJI">{t('Bajaji', 'Bajaji')}</option><option value="BICYCLE">{t('Bicycle', 'Baiskeli')}</option><option value="CAR">{t('Car', 'Gari')}</option><option value="TRUCK">{t('Truck', 'Lori')}</option>
                    </select>
                  </label>
                  <Field label={t('Vehicle reg. number', 'Namba ya usajili')} placeholder="MC 123 ABC" value={form.plateNo} onChange={(e) => setForm((f) => ({ ...f, plateNo: e.target.value.toUpperCase() }))} />
                </div>
              )}
              <Shot url={selfie} on={(e: any) => pick(e, 'selfie')} label={t('Selfie photo', 'Picha ya uso')} icon={<Camera size={28} />} capture="user" />
              <Shot url={idImg} on={(e: any) => pick(e, 'id')} label={t('ID document photo', 'Picha ya kitambulisho')} icon={<CreditCard size={28} />} capture="environment" />
              <Button variant="primary" className="w-full" loading={busy} onClick={submit}><Upload size={17} /> {t('Submit for verification', 'Wasilisha kwa uthibitisho')}</Button>
            </Card>
          </>
        )}
      </div>
      <RoleNav role={role} />
    </div>
  );
}
