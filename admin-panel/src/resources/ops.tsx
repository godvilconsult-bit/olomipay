import { useEffect, useState } from 'react';
import { Title } from 'react-admin';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const tok = () => localStorage.getItem('olomipay_admin_at') ?? '';
const get = (p: string) => fetch(`${API}/api/admin${p}`, { headers: { Authorization: `Bearer ${tok()}` } }).then(r => r.json());

function Box({ children }: any) { return <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>{children}</div>; }

export const OpsList = () => {
  const [t, setT] = useState<any>(null);
  const [risk, setRisk] = useState<any>(null);
  const [an, setAn] = useState<any>(null);
  useEffect(() => {
    get('/treasury').then(r => r.success && setT(r.data));
    get('/risk/alerts').then(r => r.success && setRisk(r.data));
    get('/analytics').then(r => r.success && setAn(r.data));
  }, []);

  return (
    <div style={{ padding: 16, display: 'grid', gap: 16 }}>
      <Title title="Operations" />
      <h2 style={{ margin: 0 }}>Operations</h2>

      {/* Treasury / reconciliation */}
      <Box>
        <h3 style={{ marginTop: 0 }}>Treasury & reconciliation</h3>
        {!t ? 'Loading…' : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            <div><p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>Platform USDC</p><b>${parseFloat(t.platformWallet.usdc).toFixed(2)}</b></div>
            <div><p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>Fee wallet USDC</p><b>${parseFloat(t.feeWallet.usdc).toFixed(2)}</b></div>
            <div><p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>User liabilities</p><b>${t.ledger.userLiabilitiesUsdc.toFixed(2)}</b></div>
            <div><p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>Reconciliation</p>
              <b style={{ color: t.reconciliation.healthy ? '#16a34a' : '#dc2626' }}>
                {t.reconciliation.healthy ? '✓ healthy' : '⚠ shortfall'} ({t.reconciliation.deltaUsdc >= 0 ? '+' : ''}${t.reconciliation.deltaUsdc})
              </b>
            </div>
          </div>
        )}
      </Box>

      {/* Risk alerts */}
      <Box>
        <h3 style={{ marginTop: 0 }}>Risk alerts (24h){risk ? ` — ${risk.total}` : ''}</h3>
        {!risk ? 'Loading…' : risk.alerts.length === 0 ? <p style={{ color: '#94a3b8' }}>No alerts 🎉</p> : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b' }}><th>Type</th><th>Severity</th><th>User</th><th>Info</th></tr></thead>
            <tbody>{risk.alerts.map((a: any, i: number) => (
              <tr key={i} style={{ borderTop: '1px solid #eee' }}>
                <td>{a.type}</td>
                <td><span style={{ color: a.severity === 'high' ? '#dc2626' : a.severity === 'medium' ? '#d97706' : '#64748b' }}>{a.severity}</span></td>
                <td>{a.user}</td>
                <td>{a.amountUsdc ? `$${a.amountUsdc}` : a.count ? `${a.count} tx` : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Box>

      {/* Analytics */}
      <Box>
        <h3 style={{ marginTop: 0 }}>Volume — last 30 days</h3>
        {!an ? 'Loading…' : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
            {(an.dailyVolume ?? []).map((d: any) => {
              const max = Math.max(...an.dailyVolume.map((x: any) => x.volume_usdc), 1);
              return <div key={d.day} title={`${d.day}: $${d.volume_usdc.toFixed(2)} (${d.tx_count} tx)`}
                style={{ flex: 1, background: 'linear-gradient(#3b82f6,#10b981)', height: `${(d.volume_usdc / max) * 100}%`, borderRadius: 3, minHeight: 2 }} />;
            })}
          </div>
        )}
      </Box>
    </div>
  );
};
