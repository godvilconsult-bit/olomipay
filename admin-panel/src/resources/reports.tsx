import { useState } from 'react';
import { Title, useNotify } from 'react-admin';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const tok = () => localStorage.getItem('olomipay_admin_at') ?? '';

async function download(path: string, filename: string) {
  const r = await fetch(`${API}/api/admin${path}`, { headers: { Authorization: `Bearer ${tok()}` } });
  if (!r.ok) throw new Error('Export failed (you may not have permission)');
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export const ReportsList = () => {
  const notify = useNotify();
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');
  const [busy, setBusy] = useState('');

  const qs = () => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to)   p.set('to', to);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  const run = async (kind: 'csv' | 'pdf') => {
    setBusy(kind);
    try {
      const label = `${from || 'all'}_${to || 'all'}`;
      await download(`/report/${kind}${qs()}`, `olomipay-transactions-${label}.${kind}`);
      notify('Download started', { type: 'success' });
    } catch (e: any) { notify(e.message, { type: 'error' }); }
    finally { setBusy(''); }
  };

  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1' };
  const btn: React.CSSProperties = { border: 0, borderRadius: 8, padding: '10px 18px', fontWeight: 600, color: '#fff', cursor: 'pointer' };

  return (
    <div style={{ padding: 16, display: 'grid', gap: 16, maxWidth: 640 }}>
      <Title title="Reports" />
      <h2 style={{ margin: 0 }}>Reports & exports</h2>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
        Export transactions for a date range. CSV opens in Excel/Sheets; PDF is a formatted report.
      </p>
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 13 }}>From<br /><input style={inp} type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label style={{ fontSize: 13 }}>To<br /><input style={inp} type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Leave blank for all-time</span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => run('csv')} disabled={!!busy} style={{ ...btn, background: '#16a34a' }}>
            {busy === 'csv' ? 'Preparing…' : '⬇ Excel / CSV'}
          </button>
          <button onClick={() => run('pdf')} disabled={!!busy} style={{ ...btn, background: '#dc2626' }}>
            {busy === 'pdf' ? 'Preparing…' : '⬇ PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};
