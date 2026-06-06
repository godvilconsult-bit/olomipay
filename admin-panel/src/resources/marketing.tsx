import { useEffect, useState } from 'react';
import { Title } from 'react-admin';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const tok = () => localStorage.getItem('olomipay_admin_at') ?? '';
const get = (p: string) => fetch(`${API}/api/admin${p}`, { headers: { Authorization: `Bearer ${tok()}` } }).then(r => r.json());

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
      <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700 }}>{value}</p>
      {sub && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>{sub}</p>}
    </div>
  );
}

/**
 * Marketing dashboard — growth metrics only (no money controls, no PII).
 * Safe for the marketing department to see.
 */
export const MarketingList = () => {
  const [stats, setStats] = useState<any>(null);
  const [an, setAn] = useState<any>(null);

  useEffect(() => {
    get('/stats').then(r => r.success && setStats(r.data));
    get('/analytics').then(r => r.success && setAn(r.data)).catch(() => {});
  }, []);

  const daily = an?.dailyVolume ?? [];
  const max = Math.max(1, ...daily.map((d: any) => d.volume_usdc ?? 0));

  return (
    <div style={{ padding: 16, display: 'grid', gap: 16, maxWidth: 900 }}>
      <Title title="Marketing" />
      <h2 style={{ margin: 0 }}>Marketing & growth</h2>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Growth metrics for the marketing team — no customer details or money controls.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <Stat label="Total users" value={stats ? Number(stats.totalUsers ?? stats.userCount ?? 0).toLocaleString() : '…'} />
        <Stat label="Total transactions" value={stats ? Number(stats.totalTransactions ?? stats.txCount ?? 0).toLocaleString() : '…'} />
        <Stat label="Volume (30d)" value={an ? `$${Number(an.totalVolumeUsdc ?? daily.reduce((s: number, d: any) => s + (d.volume_usdc ?? 0), 0)).toFixed(0)}` : '…'} />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
        <h3 style={{ marginTop: 0 }}>Transaction volume — last 30 days</h3>
        {daily.length === 0 ? <p style={{ color: '#94a3b8' }}>No data yet.</p> : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140 }}>
            {daily.map((d: any) => (
              <div key={d.day} title={`${d.day}: $${(d.volume_usdc ?? 0).toFixed(2)} (${d.tx_count ?? 0} tx)`}
                style={{ flex: 1, background: 'linear-gradient(#3b82f6,#10b981)', height: `${((d.volume_usdc ?? 0) / max) * 100}%`, borderRadius: 3, minHeight: 2 }} />
            ))}
          </div>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
        <h3 style={{ marginTop: 0 }}>Referral / invite link</h3>
        <p style={{ fontSize: 13, color: '#475569' }}>Share OlomiPay to grow the user base:</p>
        <code style={{ display: 'block', background: '#f1f5f9', padding: 10, borderRadius: 8 }}>https://olomipay.vercel.app</code>
      </div>
    </div>
  );
};
