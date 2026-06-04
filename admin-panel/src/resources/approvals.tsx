import { useEffect, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import { adminAction } from '../dataProvider';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const tok = () => localStorage.getItem('olomipay_admin_at') ?? '';

export const ApprovalsList = () => {
  const [rows, setRows] = useState<any[]>([]);
  const notify = useNotify();

  const load = () => fetch(`${API}/api/admin/approvals`, { headers: { Authorization: `Bearer ${tok()}` } })
    .then(r => r.json()).then(r => r.success && setRows(r.data.approvals ?? []));
  useEffect(() => { load(); }, []);

  const decide = async (id: string, kind: 'approve' | 'reject') => {
    try {
      const r: any = await adminAction(`/approvals/${id}/${kind}`);
      const msg = kind === 'reject' ? 'Rejected'
        : r?.executed ? (r.message ?? 'Approved & executed')
        : (r?.message ?? `Approval ${r?.approved ?? ''} of ${r?.required ?? ''} recorded`);
      notify(msg, { type: 'success' });
      load();
    } catch (e: any) { notify(e.message, { type: 'error' }); }
  };

  return (
    <div style={{ padding: 16 }}>
      <Title title="Approvals" />
      <h2>Multi-step approvals</h2>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>Money-moving actions need <b>3 distinct admin approvals</b> (FINANCE / SUPER_ADMIN) before they execute. The maker can’t approve their own request, and no one can approve twice. A <b>SUPER_ADMIN</b> can override and execute in one step.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead><tr style={{ textAlign: 'left', color: '#64748b' }}>
          <th>When</th><th>Action</th><th>Maker</th><th>Detail</th><th>Progress</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          {rows.map(a => {
            let p: any = {}; try { p = JSON.parse(a.payload ?? '{}'); } catch {}
            const approvals = Array.isArray(a.approvals) ? a.approvals : [];
            const required  = a.requiredApprovals ?? 3;
            return (
              <tr key={a.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                <td>{new Date(a.createdAt).toLocaleString()}</td>
                <td>{a.action}</td>
                <td>{a.makerPhone}</td>
                <td style={{ fontSize: 12 }}>{p.amountUsdc ? `$${p.amountUsdc} → ${p.phone} (${p.reason})` : a.payload}</td>
                <td title={approvals.map((x: any) => x.phone).join(', ')} style={{ fontWeight: 600, color: approvals.length >= required ? '#166534' : '#854d0e' }}>
                  {approvals.length} / {required}
                </td>
                <td><span style={{ fontWeight: 600, color: a.status === 'PENDING' ? '#854d0e' : a.status === 'APPROVED' ? '#166534' : '#991b1b' }}>{a.status}</span></td>
                <td style={{ display: 'flex', gap: 6, padding: '6px 0' }}>
                  {a.status === 'PENDING' && <>
                    <button onClick={() => decide(a.id, 'approve')} style={{ background: '#16a34a', color: '#fff', border: 0, borderRadius: 6, padding: '4px 10px' }}>Approve</button>
                    <button onClick={() => decide(a.id, 'reject')} style={{ background: '#dc2626', color: '#fff', border: 0, borderRadius: 6, padding: '4px 10px' }}>Reject</button>
                  </>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
