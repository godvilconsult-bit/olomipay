import { useEffect, useState, useRef } from 'react';
import { Title, useNotify, useRedirect } from 'react-admin';
import { adminAction } from '../dataProvider';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const tok = () => localStorage.getItem('olomipay_admin_at') ?? '';
const get = (p: string) => fetch(`${API}/api/admin${p}`, { headers: { Authorization: `Bearer ${tok()}` } }).then(r => r.json());

const chip = (s: string) => ({
  OPEN: { bg: '#dbeafe', c: '#1d4ed8', t: 'Open' },
  PENDING: { bg: '#fef3c7', c: '#b45309', t: 'Replied' },
  RESOLVED: { bg: '#dcfce7', c: '#166534', t: 'Resolved' },
}[s] ?? { bg: '#e2e8f0', c: '#475569', t: s });

export const TicketsList = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState('');
  const notify = useNotify();
  const redirect = useRedirect();
  const endRef = useRef<HTMLDivElement>(null);

  const load = () => get(`/support/tickets${filter ? `?status=${filter}` : ''}`).then(r => r.success && setRows(r.data.tickets ?? []));
  useEffect(() => { load(); }, [filter]);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [messages]);

  const open = async (id: string) => {
    const r = await get(`/support/tickets/${id}`);
    if (r.success) { setActive(r.data.ticket); setMessages(r.data.messages ?? []); load(); }
  };
  const sendReply = async () => {
    if (!reply.trim() || !active) return;
    const text = reply; setReply('');
    try { await adminAction(`/support/tickets/${active.id}/reply`, { body: text }); open(active.id); }
    catch (e: any) { notify(e.message, { type: 'error' }); }
  };
  const setStatus = async (status: string) => {
    try { await adminAction(`/support/tickets/${active.id}/status`, { status }); notify(`Ticket ${status}`, { type: 'success' }); open(active.id); }
    catch (e: any) { notify(e.message, { type: 'error' }); }
  };

  const cell: any = { padding: '8px', fontSize: 13, borderTop: '1px solid #eee' };

  return (
    <div style={{ padding: 16, display: 'grid', gridTemplateColumns: active ? '1fr 1fr' : '1fr', gap: 16 }}>
      <Title title="Support tickets" />
      <div>
        <h2 style={{ marginTop: 0 }}>Support tickets</h2>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {['', 'OPEN', 'PENDING', 'RESOLVED'].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '4px 12px', borderRadius: 16, border: '1px solid #cbd5e1', cursor: 'pointer',
              background: filter === s ? '#0f172a' : '#fff', color: filter === s ? '#fff' : '#334155',
            }}>{s === '' ? 'All' : chip(s).t}</button>
          ))}
        </div>
        {rows.length === 0 ? <p style={{ color: '#94a3b8' }}>No tickets.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b', fontSize: 12 }}>
              <th style={cell}>Subject</th><th style={cell}>Customer</th><th style={cell}>Updated</th><th style={cell}>Status</th>
            </tr></thead>
            <tbody>
              {rows.map(t => {
                const c = chip(t.status);
                return (
                  <tr key={t.id} onClick={() => open(t.id)} style={{ cursor: 'pointer', background: active?.id === t.id ? '#f1f5f9' : undefined }}>
                    <td style={cell}>{t.unreadForAdmin && <span style={{ display: 'inline-block', width: 8, height: 8, background: '#2563eb', borderRadius: 8, marginRight: 6 }} />}{t.subject}</td>
                    <td style={cell}>{t.kycName ?? t.phone}</td>
                    <td style={cell}>{new Date(t.lastMessageAt).toLocaleString()}</td>
                    <td style={cell}><span style={{ background: c.bg, color: c.c, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{c.t}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Thread pane */}
      {active && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0 }}>{active.subject}</h3>
              <a onClick={() => redirect('show', 'users', active.customerId)} style={{ color: '#2563eb', cursor: 'pointer', fontSize: 13 }}>
                {active.kycName ?? active.phone} · {active.category} → open Customer 360
              </a>
            </div>
            <button onClick={() => setActive(null)} style={{ border: 0, background: 'transparent', fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', margin: '12px 0', display: 'grid', gap: 8 }}>
            {messages.map(m => (
              <div key={m.id} style={{ justifySelf: m.authorType === 'ADMIN' ? 'end' : 'start', maxWidth: '80%' }}>
                <div style={{ background: m.authorType === 'ADMIN' ? '#2563eb' : '#f1f5f9', color: m.authorType === 'ADMIN' ? '#fff' : '#0f172a', padding: '8px 12px', borderRadius: 12, fontSize: 14, whiteSpace: 'pre-wrap' }}>
                  {m.body}
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', textAlign: m.authorType === 'ADMIN' ? 'right' : 'left' }}>{new Date(m.createdAt).toLocaleString()}</div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendReply()}
              placeholder="Reply to customer…" style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }} />
            <button onClick={sendReply} style={{ background: '#2563eb', color: '#fff', border: 0, borderRadius: 8, padding: '8px 16px' }}>Send</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={() => setStatus('RESOLVED')} style={{ background: '#16a34a', color: '#fff', border: 0, borderRadius: 6, padding: '4px 10px' }}>Mark resolved</button>
            <button onClick={() => setStatus('OPEN')} style={{ background: '#64748b', color: '#fff', border: 0, borderRadius: 6, padding: '4px 10px' }}>Reopen</button>
          </div>
        </div>
      )}
    </div>
  );
};
