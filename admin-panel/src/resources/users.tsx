import {
  List, Datagrid, TextField, BooleanField, DateField, Show, SimpleShowLayout,
  FunctionField, SearchInput, useRecordContext, useRefresh, useNotify, TopToolbar,
} from 'react-admin';
import { useState, useEffect } from 'react';
import { adminAction } from '../dataProvider';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const atok = () => localStorage.getItem('olomipay_admin_at') ?? '';

const userFilters = [<SearchInput key="q" source="q" alwaysOn placeholder="Phone or name" />];

export const UserList = () => (
  <List filters={userFilters} perPage={25} sort={{ field: 'createdAt', order: 'DESC' }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="kycName" label="Name" />
      <TextField source="phone" />
      <TextField source="kycStatus" label="KYC" />
      <BooleanField source="isAdmin" label="Admin" />
      <TextField source="adminRole" label="Role" />
      <DateField source="createdAt" label="Joined" />
    </Datagrid>
  </List>
);

// ── Support action buttons (Customer 360) ──────────────────────────────────────
function SupportActions() {
  const record  = useRecordContext();
  const refresh = useRefresh();
  const notify  = useNotify();
  const [pin, setPin] = useState('');
  if (!record) return null;

  const run = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); notify(ok, { type: 'success' }); refresh(); }
    catch (e: any) { notify(e.message ?? 'Failed', { type: 'error' }); }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 0', alignItems: 'center' }}>
      {/* App users are NEVER made admins — admin access is via Staff accounts only. */}
      <button onClick={() => run(() => adminAction(`/users/${record.id}/block`), 'Account frozen')}>Freeze</button>
      <button onClick={() => run(() => adminAction(`/users/${record.id}/unblock`), 'Account unfrozen')}>Unfreeze</button>
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <input placeholder="New 6-digit PIN" value={pin} maxLength={6}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))} style={{ width: 120 }} />
        <button disabled={pin.length !== 6}
          onClick={() => run(async () => { await adminAction(`/users/${record.id}/reset-pin`, { newPin: pin }); setPin(''); }, 'PIN reset — wallet preserved')}>
          Reset PIN
        </button>
      </span>
    </div>
  );
}

// ── Automated diagnosis: detected problems + recommended fix ───────────────────
function Diagnose() {
  const record = useRecordContext();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  if (!record) return null;

  const run = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/users/${record.id}/diagnose`, { headers: { Authorization: `Bearer ${atok()}` } });
      const j = await r.json(); setD(j.success ? j.data : { error: j.error });
    } finally { setLoading(false); }
  };

  const sevColor = (s: string) => s === 'high' ? '#dc2626' : s === 'medium' ? '#d97706' : '#64748b';

  return (
    <div style={{ padding: '8px 0' }}>
      <button onClick={run} disabled={loading} style={{ background: '#0f172a', color: '#fff', border: 0, borderRadius: 8, padding: '6px 14px' }}>
        {loading ? 'Diagnosing…' : '🩺 Run diagnosis'}
      </button>
      {d && (
        <div style={{ marginTop: 12 }}>
          {d.wallet && (
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>
              Chain: {d.wallet.funded ? 'funded' : 'NOT funded'} · USDC trustline {d.wallet.hasUsdcTrustline ? '✓' : '✗'} · key {d.wallet.keyValid ? 'valid' : 'CORRUPT'} · {d.wallet.deterministic ? 'recoverable' : 'legacy'} · ${parseFloat(d.wallet.usdc).toFixed(2)} / {parseFloat(d.wallet.xlm).toFixed(2)} XLM
            </div>
          )}
          {d.healthy ? <p style={{ color: '#16a34a', fontWeight: 600 }}>✓ No problems detected.</p> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {(d.problems ?? []).map((p: any, i: number) => (
                <div key={i} style={{ borderLeft: `4px solid ${sevColor(p.severity)}`, background: '#f8fafc', padding: '8px 12px', borderRadius: 6 }}>
                  <div style={{ fontWeight: 600, color: sevColor(p.severity) }}>{p.code} · {p.severity}</div>
                  <div style={{ fontSize: 13 }}>{p.message}</div>
                  <div style={{ fontSize: 13, color: '#334155', marginTop: 4 }}><b>→ Fix:</b> {p.action}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── This user's transactions — spot problems fast ──────────────────────────────
function UserTransactions() {
  const record = useRecordContext();
  const [txs, setTxs] = useState<any[] | null>(null);
  useEffect(() => {
    if (!record) return;
    fetch(`${API}/api/admin/transactions?userId=${record.id}&limit=50`, { headers: { Authorization: `Bearer ${atok()}` } })
      .then(r => r.json()).then(j => setTxs(j.success ? (j.data.transactions ?? []) : []));
  }, [record?.id]);
  if (!record) return null;

  const color = (s: string) => s === 'CONFIRMED' ? '#16a34a' : s === 'FAILED' ? '#dc2626' : '#d97706';
  return (
    <div style={{ padding: '8px 0' }}>
      {!txs ? 'Loading…' : txs.length === 0 ? <p style={{ color: '#94a3b8', fontSize: 13 }}>No transactions.</p> : (
        <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748b' }}>
            <th>Date</th><th>Type</th><th>Amount</th><th>Status</th><th>Ref</th>
          </tr></thead>
          <tbody>
            {txs.map((t: any) => (
              <tr key={t.id} style={{ borderTop: '1px solid #eee' }}>
                <td>{new Date(t.createdAt).toLocaleString()}</td>
                <td>{t.type}</td>
                <td>{t.amountUsdc != null ? `$${Number(t.amountUsdc).toFixed(2)}` : (t.amountTzs ? `TZS ${Number(t.amountTzs).toLocaleString()}` : '')}</td>
                <td style={{ color: color(t.status), fontWeight: 600 }}>{t.status}</td>
                <td style={{ fontFamily: 'monospace' }}>{t.stellarTxId ? String(t.stellarTxId).slice(0, 8) : (t.errorMsg ? '⚠' : '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Append-only support case notes ─────────────────────────────────────────────
function CaseNotes() {
  const record = useRecordContext();
  const notify = useNotify();
  const [notes, setNotes] = useState<any[]>([]);
  const [text, setText] = useState('');

  const load = () => record && fetch(`${API}/api/admin/users/${record.id}/notes`, { headers: { Authorization: `Bearer ${atok()}` } })
    .then(r => r.json()).then(j => j.success && setNotes(j.data.notes ?? []));
  useEffect(() => { load(); }, [record?.id]);
  if (!record) return null;

  const add = async () => {
    if (!text.trim()) return;
    try { await adminAction(`/users/${record.id}/notes`, { note: text }); setText(''); notify('Note saved', { type: 'success' }); load(); }
    catch (e: any) { notify(e.message, { type: 'error' }); }
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a support note…"
          onKeyDown={e => e.key === 'Enter' && add()} style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }} />
        <button onClick={add} style={{ background: '#2563eb', color: '#fff', border: 0, borderRadius: 6, padding: '6px 14px' }}>Add</button>
      </div>
      <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
        {notes.length === 0 ? <p style={{ color: '#94a3b8', fontSize: 13 }}>No notes yet.</p> : notes.map(n => (
          <div key={n.id} style={{ background: '#f8fafc', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}>
            <div>{n.note}</div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>{n.authorPhone ?? 'admin'} · {new Date(n.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KYC documents (compliance review / dispute evidence) ──────────────────────
function KycDocuments() {
  const record = useRecordContext();
  const [info, setInfo] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!record?.id) return;
    fetch(`${API}/api/kyc/admin/${record.id}/documents`, { headers: { Authorization: `Bearer ${atok()}` } })
      .then(r => r.json())
      .then(r => { if (r.success) { setInfo(r.data.user); setDocs(r.data.documents ?? []); } })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [record?.id]);

  // Fetch each document with auth → object URL (images can't carry auth headers).
  useEffect(() => {
    let revoked: string[] = [];
    (async () => {
      for (const d of docs) {
        try {
          const r = await fetch(`${API}/api/kyc/admin/document/${d.id}`, { headers: { Authorization: `Bearer ${atok()}` } });
          if (!r.ok) continue;
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          revoked.push(url);
          setUrls(u => ({ ...u, [d.id]: url }));
        } catch { /* skip */ }
      }
    })();
    return () => { revoked.forEach(u => URL.revokeObjectURL(u)); };
  }, [docs]);

  const label: Record<string, string> = { ID_FRONT: 'ID — front', ID_BACK: 'ID — back', SELFIE: 'Selfie + ID' };

  if (!loaded) return <span style={{ color: '#94a3b8' }}>Loading…</span>;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {info && (
        <div style={{ fontSize: 13, color: '#334155' }}>
          <b>Status:</b> {info.kycStatus} · <b>Level:</b> {info.kycLevel ?? 0} ·{' '}
          <b>Name:</b> {info.kycName ?? '—'} · <b>ID:</b> {info.kycIdType ?? '—'} {info.kycIdNumber ?? ''}
        </div>
      )}
      {docs.length === 0 ? (
        <span style={{ color: '#94a3b8', fontSize: 13 }}>No documents uploaded.</span>
      ) : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {docs.map(d => (
            <div key={d.id} style={{ width: 180 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{label[d.kind] ?? d.kind}</div>
              {urls[d.id]
                ? <img src={urls[d.id]} alt={d.kind} style={{ width: '100%', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                : <div style={{ height: 120, background: '#f1f5f9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12 }}>Loading…</div>}
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{new Date(d.uploadedAt).toLocaleString()}</div>
              {urls[d.id] && <a href={urls[d.id]} download={`${d.kind}.jpg`} style={{ fontSize: 12, color: '#1a56db' }}>⬇ Download</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const UserShow = () => (
  <Show actions={<TopToolbar><SupportActions /></TopToolbar>}>
    <SimpleShowLayout>
      <TextField source="kycName" label="Name" />
      <TextField source="phone" />
      <TextField source="kycStatus" label="KYC status" />
      <BooleanField source="isAdmin" />
      <TextField source="adminRole" label="RBAC role" />
      <BooleanField source="isFeeCollector" />
      <BooleanField source="activationFeePaid" label="Activation paid" />
      <TextField source="stellarPubKey" label="Wallet address" />
      <FunctionField label="Wallet recoverable" render={(r: any) => r._full?.walletDeterministic ? '✓ deterministic (recoverable)' : '⚠ legacy address'} />
      <FunctionField label="Balance" render={(r: any) => r._full ? `$${parseFloat(r._full.balance?.usdc ?? 0).toFixed(2)} · ${parseFloat(r._full.balance?.xlm ?? 0).toFixed(2)} XLM` : '—'} />
      <DateField source="createdAt" label="Joined" showTime />
      <FunctionField label="KYC documents" render={() => <KycDocuments />} />
      <FunctionField label="Transactions" render={() => <UserTransactions />} />
      <FunctionField label="Diagnosis" render={() => <Diagnose />} />
      <FunctionField label="Case notes" render={() => <CaseNotes />} />
    </SimpleShowLayout>
  </Show>
);
