import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
      <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 800, color: '#1a56db' }}>{value}</p>
      {sub && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>{sub}</p>}
    </div>
  );
}

export const Dashboard = () => {
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    fetch(`${API}/api/admin/stats`, { headers: { Authorization: `Bearer ${localStorage.getItem('olomipay_admin_at')}` } })
      .then(r => r.json()).then(r => r.success && setS(r.data)).catch(() => {});
  }, []);
  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>OlomiPay — Operations</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <Card label="Total users"        value={s ? String(s.totalUsers) : '…'} />
        <Card label="Transactions"       value={s ? String(s.totalTransactions) : '…'} />
        <Card label="Volume (USD)"       value={s ? `$${parseFloat(s.totalVolumeUsdc ?? 0).toFixed(2)}` : '…'} />
        <Card label="Fees earned (1%)"   value={s ? `$${parseFloat(s.feesCollectedUsdc ?? 0).toFixed(4)}` : '…'} sub="revenue" />
      </div>
      <p style={{ marginTop: 18, fontSize: 12, color: '#94a3b8' }}>
        Use the left menu: Users (search + support actions), Transactions (resolve stuck), Audit (every admin action).
      </p>
    </div>
  );
};
