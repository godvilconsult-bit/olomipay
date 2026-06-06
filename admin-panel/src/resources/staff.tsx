import { useEffect, useState } from 'react';
import { Title } from 'react-admin';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const tok = () => localStorage.getItem('olomipay_admin_at') ?? '';
const get = (p: string) => fetch(`${API}/api/admin${p}`, { headers: { Authorization: `Bearer ${tok()}` } }).then(r => r.json());

const flagLabel: Record<string, string> = {
  high_sensitive_volume: 'High money/access volume',
  frequent_off_hours:    'Frequent off-hours activity',
  many_ip_addresses:     'Many IP addresses',
};

export const StaffActivityList = () => {
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(7);

  useEffect(() => { get(`/staff-activity?days=${days}`).then(r => r.success ? setData(r.data) : setData({ error: r.error })); }, [days]);

  return (
    <div style={{ padding: 16, display: 'grid', gap: 16 }}>
      <Title title="Staff activity" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Staff activity & accountability</h2>
        <select value={days} onChange={e => { setData(null); setDays(Number(e.target.value)); }} style={{ padding: '4px 8px', borderRadius: 6 }}>
          <option value={1}>Last 24h</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option>
        </select>
      </div>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
        Every back-office action is logged immutably. Watch for unusual patterns — high volumes of
        money/access actions, off-hours activity, or many IPs. (SUPER_ADMIN only.)
      </p>

      {data?.error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8 }}>{data.error}</div>}
      {!data ? 'Loading…' : !data.error && (
        <>
          {/* Per-staff summary */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
            <h3 style={{ marginTop: 0 }}>By staff member ({data.totalActions} actions)</h3>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: '#64748b' }}>
                <th>Staff</th><th>Total</th><th>Money/access</th><th>Off-hours</th><th>IPs</th><th>Flags</th>
              </tr></thead>
              <tbody>
                {(data.staff ?? []).map((s: any) => (
                  <tr key={s.adminId} style={{ borderTop: '1px solid #eee', background: s.flags.length ? '#fffbeb' : undefined }}>
                    <td>{s.adminPhone ?? s.adminId.slice(0, 8)}</td>
                    <td>{s.total}</td>
                    <td style={{ fontWeight: 600 }}>{s.sensitive}</td>
                    <td>{s.offHours}</td>
                    <td>{s.distinctIps}</td>
                    <td>{s.flags.map((f: string) => (
                      <span key={f} style={{ fontSize: 11, background: '#fecaca', color: '#991b1b', padding: '2px 6px', borderRadius: 8, marginRight: 4 }}>
                        {flagLabel[f] ?? f}
                      </span>
                    ))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recent high-risk feed */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
            <h3 style={{ marginTop: 0 }}>Recent money/access actions</h3>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: '#64748b' }}><th>When</th><th>Staff</th><th>Action</th><th>Target</th><th>IP</th></tr></thead>
              <tbody>
                {(data.recentHighRisk ?? []).map((r: any, i: number) => (
                  <tr key={i} style={{ borderTop: '1px solid #eee', color: r.offHours ? '#b45309' : undefined }}>
                    <td>{new Date(r.at).toLocaleString()}</td>
                    <td>{r.adminPhone}</td>
                    <td>{r.action}</td>
                    <td>{r.targetType ?? ''}</td>
                    <td style={{ fontSize: 11 }}>{r.ip ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
