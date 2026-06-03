import { useState } from 'react';
import { useLogin, useNotify } from 'react-admin';

/**
 * Two-step admin login: phone + PIN, then (if the admin has 2FA enabled) an
 * authenticator code. The authProvider throws TOTP_REQUIRED after the password
 * step when a second factor is needed; we catch it and reveal the code field.
 */
export default function LoginPage() {
  const login  = useLogin();
  const notify = useNotify();
  const [phone, setPhone] = useState('');
  const [pin, setPin]     = useState('');
  const [totp, setTotp]   = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [busy, setBusy]   = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login({ username: phone, password: pin, totp: needTotp ? totp : undefined });
    } catch (err: any) {
      if (err?.code === 'TOTP_REQUIRED') { setNeedTotp(true); notify('Enter your authenticator code', { type: 'info' }); }
      else notify(err?.message ?? 'Login failed', { type: 'error' });
    } finally { setBusy(false); }
  };

  const field: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 15, marginTop: 6 };
  const label: React.CSSProperties = { fontSize: 13, color: '#475569', fontWeight: 600 };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#0f172a,#1e293b)' }}>
      <form onSubmit={submit} style={{ background: '#fff', padding: 32, borderRadius: 20, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>OlomiPay Admin</h1>
        <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 13 }}>Building Trust Through Blockchain</p>

        {!needTotp ? (
          <>
            <label style={label}>Phone
              <input style={field} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+255712345678" autoFocus />
            </label>
            <label style={{ ...label, display: 'block', marginTop: 14 }}>PIN
              <input style={field} type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} maxLength={6} placeholder="••••••" />
            </label>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: '#334155' }}>Two-factor authentication is on for this account. Enter the 6-digit code from your authenticator app.</p>
            <label style={label}>Authenticator code
              <input style={{ ...field, letterSpacing: 6, textAlign: 'center', fontSize: 20 }} inputMode="numeric" value={totp}
                onChange={e => setTotp(e.target.value.replace(/\D/g, ''))} maxLength={6} placeholder="000000" autoFocus />
            </label>
          </>
        )}

        <button type="submit" disabled={busy} style={{ width: '100%', marginTop: 20, padding: '12px', borderRadius: 10, border: 0, background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          {busy ? 'Signing in…' : needTotp ? 'Verify & sign in' : 'Sign in'}
        </button>

        {needTotp && (
          <button type="button" onClick={() => { setNeedTotp(false); setTotp(''); }} style={{ width: '100%', marginTop: 8, padding: 8, border: 0, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>
            ← Back
          </button>
        )}
      </form>
    </div>
  );
}
