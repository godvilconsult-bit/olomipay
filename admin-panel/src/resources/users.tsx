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
      <FunctionField label="Diagnosis" render={() => <Diagnose />} />
      <FunctionField label="Case notes" render={() => <CaseNotes />} />
    </SimpleShowLayout>
  </Show>
);
