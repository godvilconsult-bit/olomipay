import { useState } from 'react';
import { Title, useNotify } from 'react-admin';
import { adminAction } from '../dataProvider';

export const SecurityList = () => {
  const notify = useNotify();
  const [secret, setSecret] = useState('');
  const [otpauth, setOtpauth] = useState('');
  const [code, setCode] = useState('');
  const [enabled, setEnabled] = useState(false);

  const setup = async () => {
    try { const d = await adminAction('/2fa/setup'); setSecret(d.secret); setOtpauth(d.otpauth); setEnabled(false); }
    catch (e: any) { notify(e.message, { type: 'error' }); }
  };
  const enable = async () => {
    try { await adminAction('/2fa/enable', { token: code }); setEnabled(true); setCode(''); notify('2FA enabled', { type: 'success' }); }
    catch (e: any) { notify(e.message, { type: 'error' }); }
  };

  const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)', maxWidth: 560 };
  const mono: React.CSSProperties = { fontFamily: 'monospace', background: '#f1f5f9', padding: '8px 12px', borderRadius: 8, wordBreak: 'break-all', fontSize: 13 };

  return (
    <div style={{ padding: 16 }}>
      <Title title="Security" />
      <h2>Two-factor authentication</h2>
      <div style={card}>
        <p style={{ color: '#475569', fontSize: 14 }}>
          Protect your admin account with a time-based one-time code (TOTP). Once enabled, you'll
          enter a 6-digit code from your authenticator app every time you sign in.
        </p>

        {!secret && !enabled && (
          <button onClick={setup} style={{ background: '#0f172a', color: '#fff', border: 0, borderRadius: 8, padding: '10px 18px' }}>
            Set up 2FA
          </button>
        )}

        {secret && !enabled && (
          <div style={{ display: 'grid', gap: 14, marginTop: 8 }}>
            <div>
              <p style={{ fontWeight: 600, margin: '0 0 6px' }}>1. Add this key to your authenticator app</p>
              <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 6px' }}>In Google Authenticator / Authy choose “Enter a setup key” and paste:</p>
              <div style={mono}>{secret}</div>
              <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 6 }}>Account: OlomiPay Admin · Type: Time-based</p>
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: '#64748b' }}>Show otpauth URI</summary>
                <div style={{ ...mono, marginTop: 6 }}>{otpauth}</div>
              </details>
            </div>
            <div>
              <p style={{ fontWeight: 600, margin: '0 0 6px' }}>2. Enter the current 6-digit code to confirm</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} maxLength={6} placeholder="000000"
                  style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', letterSpacing: 6, textAlign: 'center', fontSize: 18, width: 160 }} />
                <button onClick={enable} disabled={code.length !== 6} style={{ background: '#16a34a', color: '#fff', border: 0, borderRadius: 8, padding: '10px 18px' }}>
                  Enable
                </button>
              </div>
            </div>
          </div>
        )}

        {enabled && (
          <div style={{ marginTop: 8, color: '#166534', fontWeight: 600 }}>
            ✓ Two-factor authentication is enabled. You'll be asked for a code on your next sign-in.
          </div>
        )}
      </div>
    </div>
  );
};
