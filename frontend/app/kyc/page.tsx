'use client';

/* Identity verification (KYC). Collects ID type/number, full name, and photos
   of the ID + a selfie. Documents are uploaded to a PRIVATE store and are only
   viewable by compliance staff in the admin panel. */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ShieldCheck, CheckCircle2, Upload, Clock, Camera } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import PageHeader from '../../components/PageHeader';
import { kyc } from '../../lib/api';

const API = process.env.NEXT_PUBLIC_API_URL;
const tok = () => (typeof window !== 'undefined' ? (localStorage.getItem('olomipay_at') || localStorage.getItem('olomipay_rt')) : '') || '';

const ID_TYPES = [
  { value: 'NIDA',            label: 'National ID (NIDA)' },
  { value: 'PASSPORT',        label: 'Passport' },
  { value: 'VOTERS_ID',       label: "Voter's ID" },
  { value: 'DRIVING_LICENSE', label: "Driver's licence" },
];

type Kind = 'ID_FRONT' | 'ID_BACK' | 'SELFIE';

async function uploadDoc(kind: Kind, file: File) {
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', file);
  const r = await fetch(`${API}/api/kyc/document`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok()}` }, body: form,
  });
  if (!r.ok) throw new Error('Upload failed');
}

export default function KycPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [idType, setIdType]   = useState('NIDA');
  const [idNumber, setIdNumber] = useState('');
  const [name, setName]       = useState('');
  const [files, setFiles]     = useState<Record<Kind, File | null>>({ ID_FRONT: null, ID_BACK: null, SELFIE: null });
  const [busy, setBusy]       = useState(false);

  useEffect(() => {
    kyc.status().then((r: any) => { setStatus(r?.kycStatus ?? ''); if (r?.kycName) setName(r.kycName); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const pick = (kind: Kind) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFiles(prev => ({ ...prev, [kind]: f }));
  };

  async function submit() {
    if (name.trim().length < 2) { toast.error('Enter your full legal name'); return; }
    if (idNumber.trim().length < 4) { toast.error('Enter your ID number'); return; }
    if (!files.ID_FRONT) { toast.error('Add a photo of your ID'); return; }
    if (!files.SELFIE)   { toast.error('Add a selfie holding your ID'); return; }
    setBusy(true);
    try {
      await kyc.submit({ idType, idNumber: idNumber.trim(), name: name.trim() });
      await uploadDoc('ID_FRONT', files.ID_FRONT);
      if (files.ID_BACK) await uploadDoc('ID_BACK', files.ID_BACK);
      await uploadDoc('SELFIE', files.SELFIE);
      toast.success('Submitted for verification ✅');
      setStatus('SUBMITTED');
    } catch (e: any) {
      toast.error(e?.message ?? 'Submission failed');
    } finally { setBusy(false); }
  }

  const approved  = status === 'APPROVED';
  const submitted = status === 'SUBMITTED' || status === 'PENDING';

  return (
    <div className="min-h-screen pb-24">
      <PageHeader eyebrow="Account" title="Identity verification" />

      <div className="px-5 max-w-md mx-auto mt-4 space-y-4">
        {loading ? (
          <div className="card"><div className="skeleton h-24 w-full" /></div>
        ) : approved ? (
          <div className="card text-center py-10">
            <div className="w-16 h-16 mx-auto bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-3">
              <CheckCircle2 size={32} className="text-emerald-500" />
            </div>
            <h2 className="font-bold text-lg">You're verified</h2>
            <p className="text-sm text-slate-500 mt-1">Your identity is confirmed and your limits are raised.</p>
            <button onClick={() => router.push('/limits')} className="btn-primary mt-5">View my limits</button>
          </div>
        ) : submitted ? (
          <div className="card text-center py-10">
            <div className="w-16 h-16 mx-auto bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-3">
              <Clock size={30} className="text-amber-500" />
            </div>
            <h2 className="font-bold text-lg">Under review ⏳</h2>
            <p className="text-sm text-slate-500 mt-1">We've received your documents. You'll be notified once verified.</p>
            <button onClick={() => router.push('/dashboard')} className="btn-secondary mt-5">Back to home</button>
          </div>
        ) : (
          <>
            <div className="card bg-gradient-to-br from-[#1a3a6b] to-[#1a56db] text-white">
              <div className="flex items-center gap-2 text-white/80 text-sm"><ShieldCheck size={16} /> Verify to unlock more</div>
              <p className="text-sm text-white/90 mt-1.5">Confirm your identity to raise your limits and use cash agents, bank withdrawals and more.</p>
            </div>

            <div className="card space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Full legal name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="As on your ID" className="input" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">ID type</label>
                <select value={idType} onChange={e => setIdType(e.target.value)} className="input">
                  {ID_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">ID number</label>
                <input value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="Document number" className="input" />
              </div>
            </div>

            <div className="card space-y-3">
              <p className="font-semibold text-sm">Upload documents</p>
              <FileRow label="Photo of your ID (front)" hint="Clear, all corners visible" file={files.ID_FRONT} onPick={pick('ID_FRONT')} icon={Upload} required />
              <FileRow label="Back of ID (if applicable)" hint="Optional" file={files.ID_BACK} onPick={pick('ID_BACK')} icon={Upload} />
              <FileRow label="Selfie holding your ID" hint="Your face + the ID, both clear" file={files.SELFIE} onPick={pick('SELFIE')} icon={Camera} required />
              <p className="text-[11px] text-slate-400">🔒 Your documents are stored securely and only used to verify your identity.</p>
            </div>

            <button onClick={submit} disabled={busy} className="btn-primary w-full">
              {busy ? 'Submitting…' : 'Submit for verification'}
            </button>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

function FileRow({ label, hint, file, onPick, icon: Icon, required }: {
  label: string; hint: string; file: File | null; onPick: (e: any) => void; icon: any; required?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 dark:border-white/15 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${file ? 'bg-emerald-500/15 text-emerald-500' : 'bg-primary/10 text-primary'}`}>
        {file ? <CheckCircle2 size={20} /> : <Icon size={20} />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}{required && <span className="text-rose-500"> *</span>}</p>
        <p className="text-xs text-slate-400 truncate">{file ? file.name : hint}</p>
      </div>
      <input type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" />
    </label>
  );
}
