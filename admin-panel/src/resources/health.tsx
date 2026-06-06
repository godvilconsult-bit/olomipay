import { useEffect, useState } from 'react';
import { Title } from 'react-admin';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const tok = () => localStorage.getItem('olomipay_admin_at') ?? '';

function Dot({ up }: { up: boolean }) {
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: up ? '#16a34a' : '#dc2626', marginRight: 8 }} />;
}
function Row({ label, up, note }: { label: string; up: boolean; note?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
      <Dot up={up} />
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12, color: up ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{up ? 'UP' : 'DOWN'}</span>
      {note && <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 10 }}>{note}</span>}
    </div>
  );
}
function Box({ children }: any) {
  return <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>{children}</div>;
}

export const HealthList = () => {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');

  const load = () => fetch(`${API}/api/admin/system-health`, { headers: { Authorization: `Bearer ${tok()}` } })
    .then(r => r.json()).then(r => r.success ? setD(r.data) : setErr(r.error))
    .catch(() => setErr('Server unreachable — the API may be DOWN.'));
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  const c = d?.checks ?? {};

  return (
    <div style={{ padding: 16, display: 'grid', gap: 16, maxWidth: 860 }}>
      <Title title="System health" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>System health</h2>
        {d && <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 12, background: d.status === 'healthy' ? '#dcfce7' : '#fee2e2', color: d.status === 'healthy' ? '#166534' : '#991b1b' }}>{d.status?.toUpperCase()}</span>}
        <button onClick={load} style={{ marginLeft: 'auto', border: 0, background: '#e2e8f0', borderRadius: 8, padding: '6px 12px' }}>Refresh</button>
      </div>

      {err && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8 }}>{err}</div>}

      {!d ? 'Checking…' : (
        <>
          <Box>
            <h3 style={{ marginTop: 0 }}>Services</h3>
            <Row label="API server" up={d.server === 'up'} />
            <Row label="Database" up={!!c.database?.up} note={c.database?.error} />
            <Row label={`Stellar network (${c.stellar?.network ?? ''})`} up={!!c.stellar?.up} />
            <Row label={`Yellow Card (${c.yellowcard?.env ?? ''})`} up={!!c.yellowcard?.configured} note={c.yellowcard?.configured ? '' : 'not configured'} />
            <Row label="Gas treasury" up={!!c.gasTreasury?.up} note={c.gasTreasury?.xlm != null ? `${Number(c.gasTreasury.xlm).toFixed(2)} XLM` : ''} />
            <Row label="Push notifications (FCM)" up={!!c.push?.fcm} note={c.push?.fcm ? '' : 'not configured'} />
            <Row label="Error tracking (Sentry)" up={!!c.sentry?.enabled} note={c.sentry?.enabled ? '' : 'not configured'} />
            <Row label="Ops alerts (webhook)" up={!!c.alerts?.webhook} note={c.alerts?.webhook ? '' : 'not configured'} />
          </Box>

          <Box>
            <h3 style={{ marginTop: 0 }}>Security (last 24h)</h3>
            <div style={{ display: 'flex', gap: 24, marginBottom: 8 }}>
              <div><div style={{ fontSize: 22, fontWeight: 700 }}>{c.security?.failedLogins24h ?? 0}</div><div style={{ fontSize: 12, color: '#64748b' }}>Failed logins</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: (c.security?.lockouts24h ?? 0) > 0 ? '#b45309' : undefined }}>{c.security?.lockouts24h ?? 0}</div><div style={{ fontSize: 12, color: '#64748b' }}>Account lockouts</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: (c.security?.suspiciousIps?.length ?? 0) > 0 ? '#dc2626' : undefined }}>{c.security?.suspiciousIps?.length ?? 0}</div><div style={{ fontSize: 12, color: '#64748b' }}>Suspicious IPs</div></div>
            </div>
            {(c.security?.suspiciousIps?.length ?? 0) > 0 && (
              <div style={{ background: '#fef2f2', borderRadius: 8, padding: 10, fontSize: 13, color: '#991b1b' }}>
                ⚠ Possible attack — IPs with many failed logins: {c.security.suspiciousIps.map((x: any) => `${x.ip} (${x.c})`).join(', ')}
              </div>
            )}
            {(c.security?.recentLocks?.length ?? 0) > 0 && (
              <>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Recent lockouts</p>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <tbody>
                    {c.security.recentLocks.map((r: any, i: number) => (
                      <tr key={i} style={{ borderTop: '1px solid #eee' }}>
                        <td>{r.phone}</td><td>{r.ip}</td><td>{new Date(r.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Box>
        </>
      )}
    </div>
  );
};
