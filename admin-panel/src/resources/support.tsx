import { useEffect, useState } from 'react';
import { Title, useNotify, useRedirect } from 'react-admin';
import { adminAction } from '../dataProvider';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const tok = () => localStorage.getItem('olomipay_admin_at') ?? '';
const get = (p: string) => fetch(`${API}/api/admin${p}`, { headers: { Authorization: `Bearer ${tok()}` } }).then(r => r.json());

function Metric({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, minWidth: 130, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: danger && value > 0 ? '#dc2626' : '#0f172a' }}>{value}</div>
      <div style={{ color: '#64748b', fontSize: 13 }}>{label}</div>
    </div>
  );
}

export const SupportList = () => {
  const [m, setM] = useState<any>(null);
  const [stuck, setStuck] = useState<any[]>([]);
  const [attn, setAttn] = useState<any[]>([]);
  const notify = useNotify();
  const redirect = useRedirect();

  const load = () => {
    get('/support/metrics').then(r => r.success && setM(r.data));
    get('/support/stuck').then(r => r.success && setStuck(r.data.stuck ?? []));
    get('/support/attention').then(r => r.success && setAttn(r.data.attention ?? []));
  };
  useEffect(() => { load(); }, []);

  const resolve = async (id: string, status: 'CONFIRMED' | 'FAILED') => {
    try { await adminAction(`/transactions/${id}/resolve`, { status }); notify(`Marked ${status}`, { type: 'success' }); load(); }
    catch (e: any) { notify(e.message, { type: 'error' }); }
  };
  const refund = async (id: string) => {
    const reason = window.prompt('Refund reason (recorded + audited):');
    if (!reason) return;
    try { await adminAction(`/transactions/${id}/refund`, { reason }); notify('Refund recorded', { type: 'success' }); load(); }
    catch (e: any) { notify(e.message, { type: 'error' }); }
  };

  const cell: any = { padding: '6px 8px', fontSize: 13, borderTop: '1px solid #eee' };

  return (
    <div style={{ padding: 16, display: 'grid', gap: 16 }}>
      <Title title="Support console" />
      <h2 style={{ margin: 0 }}>Support console</h2>

      {m && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Metric label="Stuck money tx" value={m.stuck} danger />
          <Metric label="Failed (24h)" value={m.failed24} danger />
          <Metric label="Pending KYC" value={m.pendingKyc} />
          <Metric label="Open approvals" value={m.openApprovals} />
        </div>
      )}

      {/* Stuck transactions */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
        <h3 style={{ marginTop: 0 }}>Stuck transactions ({stuck.length}) <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 13 }}>— money tx PENDING too long</span></h3>
        {stuck.length === 0 ? <p style={{ color: '#94a3b8' }}>Nothing stuck 🎉</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b', fontSize: 12 }}>
              <th style={cell}>Age</th><th style={cell}>Type</th><th style={cell}>Amount</th><th style={cell}>Customer</th><th style={cell}>Actions</th>
            </tr></thead>
            <tbody>
              {stuck.map(t => (
                <tr key={t.id}>
                  <td style={cell}>{t.ageMin}m</td>
                  <td style={cell}>{t.type}</td>
                  <td style={cell}>{t.amountUsdc ? `$${t.amountUsdc}` : ''}{t.amountTzs ? ` / ${t.amountTzs} TZS` : ''}</td>
                  <td style={cell}><a onClick={() => redirect('show', 'users', t.userId)} style={{ color: '#2563eb', cursor: 'pointer' }}>{t.name ?? t.phone}</a></td>
                  <td style={{ ...cell, display: 'flex', gap: 6 }}>
                    <button onClick={() => resolve(t.id, 'CONFIRMED')} style={{ background: '#16a34a', color: '#fff', border: 0, borderRadius: 6, padding: '3px 8px' }}>Confirm</button>
                    <button onClick={() => resolve(t.id, 'FAILED')} style={{ background: '#64748b', color: '#fff', border: 0, borderRadius: 6, padding: '3px 8px' }}>Fail</button>
                    <button onClick={() => refund(t.id)} style={{ background: '#b45309', color: '#fff', border: 0, borderRadius: 6, padding: '3px 8px' }}>Refund</button>
                    <button onClick={() => redirect('show', 'users', t.userId)} style={{ background: '#2563eb', color: '#fff', border: 0, borderRadius: 6, padding: '3px 8px' }}>Open user</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Needs attention (failed) */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
        <h3 style={{ marginTop: 0 }}>Needs attention — failed money tx (7d) ({attn.length})</h3>
        {attn.length === 0 ? <p style={{ color: '#94a3b8' }}>No recent failures.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b', fontSize: 12 }}>
              <th style={cell}>When</th><th style={cell}>Type</th><th style={cell}>Amount</th><th style={cell}>Customer</th><th style={cell}>Charged?</th><th style={cell}>Error</th><th style={cell}></th>
            </tr></thead>
            <tbody>
              {attn.map(t => (
                <tr key={t.id}>
                  <td style={cell}>{new Date(t.createdAt).toLocaleString()}</td>
                  <td style={cell}>{t.type}</td>
                  <td style={cell}>{t.amountUsdc ? `$${t.amountUsdc}` : ''}{t.amountTzs ? ` / ${t.amountTzs} TZS` : ''}</td>
                  <td style={cell}><a onClick={() => redirect('show', 'users', t.userId)} style={{ color: '#2563eb', cursor: 'pointer' }}>{t.name ?? t.phone}</a></td>
                  <td style={cell}>{t.likelyCharged ? <span style={{ color: '#dc2626', fontWeight: 600 }}>likely yes</span> : 'no'}</td>
                  <td style={{ ...cell, color: '#991b1b', maxWidth: 240 }}>{t.errorMsg}</td>
                  <td style={cell}><button onClick={() => redirect('show', 'users', t.userId)} style={{ background: '#2563eb', color: '#fff', border: 0, borderRadius: 6, padding: '3px 8px' }}>Open user</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
