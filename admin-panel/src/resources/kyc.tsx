import { useEffect, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import { adminAction } from '../dataProvider';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const tok = () => localStorage.getItem('olomipay_admin_at') ?? '';

export const KycList = () => {
  const [rows, setRows] = useState<any[]>([]);
  const notify = useNotify();

  const load = () => fetch(`${API}/api/admin/kyc/pending`, { headers: { Authorization: `Bearer ${tok()}` } })
    .then(r => r.json()).then(r => r.success && setRows(r.data.users ?? []));
  useEffect(() => { load(); }, []);

  const decide = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    try { await adminAction(`/kyc/${id}/decision`, { decision }); notify(`KYC ${decision}`, { type: 'success' }); load(); }
    catch (e: any) { notify(e.message, { type: 'error' }); }
  };

  return (
    <div style={{ padding: 16 }}>
      <Title title="KYC review queue" />
      <h2>KYC review queue ({rows.length})</h2>
      {rows.length === 0 ? <p style={{ color: '#94a3b8' }}>Nothing pending review 🎉</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748b' }}>
            <th>Name</th><th>Phone</th><th>ID type</th><th>ID number</th><th>Status</th><th>Action</th>
          </tr></thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                <td>{u.kycName ?? '—'}</td><td>{u.phone}</td><td>{u.kycIdType ?? '—'}</td><td>{u.kycIdNumber ?? '—'}</td><td>{u.kycStatus}</td>
                <td style={{ display: 'flex', gap: 6, padding: '6px 0' }}>
                  <button onClick={() => decide(u.id, 'APPROVED')} style={{ background: '#16a34a', color: '#fff', border: 0, borderRadius: 6, padding: '4px 10px' }}>Approve</button>
                  <button onClick={() => decide(u.id, 'REJECTED')} style={{ background: '#dc2626', color: '#fff', border: 0, borderRadius: 6, padding: '4px 10px' }}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
