import { useEffect, useState } from 'react';
import { Title, useNotify } from 'react-admin';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const tok = () => localStorage.getItem('olomipay_admin_at') ?? '';

const badge = (status: string): React.CSSProperties => ({
  fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 12,
  background: status === 'active' ? '#dcfce7' : status === 'pending' ? '#fef9c3' : '#fee2e2',
  color:      status === 'active' ? '#166534' : status === 'pending' ? '#854d0e' : '#991b1b',
});

export const AgentsList = () => {
  const notify = useNotify();
  const [agents, setAgents] = useState<any[]>([]);
  const [busy, setBusy] = useState('');

  const load = () => fetch(`${API}/api/agents/admin/list`, { headers: { Authorization: `Bearer ${tok()}` } })
    .then(r => r.json()).then(r => r.success && setAgents(r.data.agents)).catch(() => {});
  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: string) => {
    setBusy(id);
    try {
      const r = await fetch(`${API}/api/agents/admin/${id}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ status }),
      }).then(r => r.json());
      if (r.success) { notify(`Agent ${status}`, { type: 'success' }); load(); }
      else notify(r.error ?? 'Failed', { type: 'error' });
    } finally { setBusy(''); }
  };

  const btn = (bg: string): React.CSSProperties => ({ border: 0, borderRadius: 8, padding: '6px 12px', color: '#fff', background: bg, cursor: 'pointer', fontSize: 13, fontWeight: 600 });

  return (
    <div style={{ padding: 16, maxWidth: 960 }}>
      <Title title="Cash agents" />
      <h2>Cash agents</h2>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>Approve applicants to activate them, or suspend agents. Active agents can cash customers in and out.</p>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,.08)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f8fafc', textAlign: 'left' }}>
            <th style={{ padding: 10 }}>Code</th><th>Business</th><th>City</th><th>Phone</th><th>Commission</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {agents.map(a => (
              <tr key={a.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: 10, fontFamily: 'monospace' }}>{a.code}</td>
                <td>{a.businessName}</td>
                <td>{a.city}</td>
                <td>{a.phone}</td>
                <td>${Number(a.commissionEarned ?? 0).toFixed(2)}</td>
                <td><span style={badge(a.status)}>{a.status}</span></td>
                <td style={{ display: 'flex', gap: 6, padding: 10 }}>
                  {a.status !== 'active'    && <button disabled={!!busy} style={btn('#16a34a')} onClick={() => setStatus(a.id, 'active')}>Approve</button>}
                  {a.status === 'active'    && <button disabled={!!busy} style={btn('#dc2626')} onClick={() => setStatus(a.id, 'suspended')}>Suspend</button>}
                  {a.status === 'suspended' && <button disabled={!!busy} style={btn('#16a34a')} onClick={() => setStatus(a.id, 'active')}>Reactivate</button>}
                </td>
              </tr>
            ))}
            {agents.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>No agents yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};
