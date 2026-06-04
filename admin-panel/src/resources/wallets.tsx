import { useEffect, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import { adminAction } from '../dataProvider';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const tok = () => localStorage.getItem('olomipay_admin_at') ?? '';
const get = (p: string) => fetch(`${API}/api/admin${p}`, { headers: { Authorization: `Bearer ${tok()}` } }).then(r => r.json());

function Box({ children }: any) {
  return <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>{children}</div>;
}

export const WalletsList = () => {
  const notify = useNotify();
  const [w, setW] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [gen, setGen] = useState<any>(null);

  const load = () => get('/wallets').then(r => r.success && setW(r.data));
  useEffect(() => { load(); }, []);

  const topup = async () => {
    setBusy('topup');
    try {
      const r: any = await adminAction('/treasury/topup');
      notify(r.refilled ? `Refilled +${(r.xlmAfter - r.xlmBefore).toFixed(2)} XLM for ${r.usdcSpent} USDC` : `No refill: ${r.reason}`, { type: 'success' });
      load();
    } catch (e: any) { notify(e.message, { type: 'error' }); }
    finally { setBusy(''); }
  };

  const generate = async () => {
    setBusy('gen');
    try { const r: any = await adminAction('/wallets/generate-fee'); setGen(r); }
    catch (e: any) { notify(e.message, { type: 'error' }); }
    finally { setBusy(''); }
  };

  const copy = (v: string) => { navigator.clipboard.writeText(v); notify('Copied', { type: 'info' }); };

  return (
    <div style={{ padding: 16, display: 'grid', gap: 16, maxWidth: 720 }}>
      <Title title="Wallets" />
      <h2 style={{ margin: 0 }}>Platform wallets</h2>

      {!w ? 'Loading…' : (
        <>
          <Box>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Gas & Fees</h3>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 10,
                background: w.separated ? '#dcfce7' : '#fef3c7', color: w.separated ? '#166534' : '#b45309' }}>
                {w.separated ? 'Separated ✓' : 'Shared ⚠'} · {w.autoRefill ? 'Auto-refill ON' : 'Auto-refill OFF'}
              </span>
            </div>

            {w.gas?.low && (
              <div style={{ marginTop: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: 10, fontSize: 13 }}>
                ⛽ Gas treasury is low — top it up.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginTop: 12 }}>
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
                <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>⛽ Gas wallet (XLM)</p>
                <b style={{ fontSize: 20, color: w.gas?.healthy ? '#0f172a' : '#dc2626' }}>{Number(w.gas?.xlm ?? 0).toFixed(2)}</b>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>
                  ~{w.gas?.estAccountsLeft?.toLocaleString()} accounts · ~{w.gas?.estTxLeft?.toLocaleString()} txs left
                </p>
              </div>
              <div style={{ background: '#eff6ff', borderRadius: 8, padding: 12 }}>
                <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>💰 Fees wallet (USDC)</p>
                <b style={{ fontSize: 20, color: '#1d4ed8' }}>${Number(w.fees?.usdc ?? 0).toFixed(2)}</b>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>Revenue + activation fees</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={topup} disabled={busy === 'topup'}
                style={{ background: '#2563eb', color: '#fff', border: 0, borderRadius: 8, padding: '8px 16px' }}>
                {busy === 'topup' ? 'Topping up…' : 'Top up gas now'}
              </button>
              {!w.separated && (
                <button onClick={generate} disabled={busy === 'gen'}
                  style={{ background: '#0f172a', color: '#fff', border: 0, borderRadius: 8, padding: '8px 16px' }}>
                  {busy === 'gen' ? 'Generating…' : 'Generate dedicated fee wallet'}
                </button>
              )}
            </div>

            <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
              <div>Gas wallet: <code>{w.gas?.publicKey}</code></div>
              <div>Fees wallet: <code>{w.fees?.publicKey}</code></div>
            </div>
          </Box>

          {gen && (
            <Box>
              <p style={{ margin: 0, fontWeight: 700, color: '#b45309' }}>⚠ Save these now — the secret is shown only once</p>
              {[['FEE_WALLET_PUBLIC', gen.env?.FEE_WALLET_PUBLIC], ['FEE_WALLET_SECRET', gen.env?.FEE_WALLET_SECRET]].map(([k, v]) => (
                <div key={k as string} style={{ marginTop: 8, background: '#f8fafc', borderRadius: 6, padding: 8 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{k}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <code style={{ flex: 1, wordBreak: 'break-all', fontSize: 12 }}>{v}</code>
                    <button onClick={() => copy(v as string)} style={{ border: 0, background: '#e2e8f0', borderRadius: 6, padding: '4px 10px' }}>Copy</button>
                  </div>
                </div>
              ))}
              <ol style={{ fontSize: 12, color: '#475569', marginTop: 10, paddingLeft: 18 }}>
                {(gen.steps ?? []).map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ol>
              <button onClick={() => setGen(null)} style={{ marginTop: 6, background: 'none', border: 0, color: '#64748b', textDecoration: 'underline', cursor: 'pointer' }}>
                I’ve saved them — hide
              </button>
            </Box>
          )}
        </>
      )}
    </div>
  );
};
