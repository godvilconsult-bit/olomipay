/* OlomiPay UI Kit — marketing + auth screens (dark "2030" skin). */

/* Aurora backdrop used by landing + auth — vivid blue · emerald · cyan · violet */
function Aurora() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <div className="olo-aurora" style={{ position: 'absolute', top: '-22%', left: '-22%', width: '62vmax', height: '62vmax', borderRadius: '50%', background: 'rgba(37,99,235,.45)', filter: 'blur(110px)' }} />
      <div className="olo-aurora" style={{ position: 'absolute', bottom: '-25%', right: '-20%', width: '58vmax', height: '58vmax', borderRadius: '50%', background: 'rgba(16,185,129,.40)', filter: 'blur(110px)', animationDelay: '-7s' }} />
      <div className="olo-aurora" style={{ position: 'absolute', top: '28%', right: '-18%', width: '46vmax', height: '46vmax', borderRadius: '50%', background: 'rgba(34,211,238,.34)', filter: 'blur(110px)', animationDelay: '-13s' }} />
      <div className="olo-aurora" style={{ position: 'absolute', bottom: '8%', left: '-18%', width: '44vmax', height: '44vmax', borderRadius: '50%', background: 'rgba(99,102,241,.30)', filter: 'blur(110px)', animationDelay: '-18s' }} />
    </div>
  );
}

/* Ambient feed — world flags + currencies drifting behind the hero */
const FEED_A = [
  { kind: 'currency', flag: '🇹🇿', country: 'Tanzania',     code: 'TZS', rate: '2,600',  accent: '#1a56db' },
  { kind: 'transfer', f1: '🇰🇪', f2: '🇺🇸', amt: '$24.00',  label: 'Kenya → USA'         },
  { kind: 'currency', flag: '🇳🇬', country: 'Nigeria',      code: 'NGN', rate: '1,580',  accent: '#16a34a' },
  { kind: 'currency', flag: '🇯🇵', country: 'Japan',        code: 'JPY', rate: '157',    accent: '#dc2626' },
  { kind: 'transfer', f1: '🇬🇭', f2: '🇬🇧', amt: '$50.00',  label: 'Ghana → UK'          },
  { kind: 'currency', flag: '🇿🇦', country: 'South Africa', code: 'ZAR', rate: '18.4',  accent: '#d97706' },
  { kind: 'currency', flag: '🇮🇳', country: 'India',        code: 'INR', rate: '83.5',  accent: '#a855f7' },
  { kind: 'transfer', f1: '🇺🇬', f2: '🇸🇦', amt: '$35.00',  label: 'Uganda → Saudi'      },
];
const FEED_B = [
  { kind: 'currency', flag: '🇬🇧', country: 'United Kingdom', code: 'GBP', rate: '0.79', accent: '#2563eb' },
  { kind: 'currency', flag: '🇩🇪', country: 'Germany',        code: 'EUR', rate: '0.93', accent: '#1e40af' },
  { kind: 'transfer', f1: '🇷🇼', f2: '🇦🇪', amt: '$30.00',    label: 'Rwanda → UAE'        },
  { kind: 'currency', flag: '🇨🇳', country: 'China',          code: 'CNY', rate: '7.24', accent: '#dc2626' },
  { kind: 'currency', flag: '🇧🇷', country: 'Brazil',         code: 'BRL', rate: '4.97', accent: '#16a34a' },
  { kind: 'transfer', f1: '🇿🇲', f2: '🇨🇦', amt: '$60.00',    label: 'Zambia → Canada'     },
  { kind: 'currency', flag: '🇦🇺', country: 'Australia',      code: 'AUD', rate: '1.53', accent: '#0891b2' },
  { kind: 'currency', flag: '🇦🇪', country: 'UAE',            code: 'AED', rate: '3.67', accent: '#f59e0b' },
];

function ActCard(c) {
  const base = {
    marginBottom: 12,
    borderRadius: 16,
    padding: '10px 13px',
    background: 'rgba(255,255,255,.07)',
    border: '1px solid rgba(255,255,255,.11)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    boxShadow: '0 8px 24px -14px rgba(0,0,0,.8)',
  };

  if (c.kind === 'currency') {
    return (
      <div style={{ ...base, borderLeft: `3px solid ${c.accent}` }}>
        <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{c.flag}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2 }}>{c.country}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            <span style={{ fontWeight: 600, color: c.accent }}>{c.code}</span>
            <span style={{ color: '#475569' }}> · 1 USD = {c.rate}</span>
          </div>
        </div>
      </div>
    );
  }
  /* transfer */
  return (
    <div style={base}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{c.f1}</span>
      <div style={{ width: 18, height: 1.5, background: 'rgba(52,211,153,.6)', borderRadius: 999, flexShrink: 0 }} />
      <span style={{ fontSize: 20, flexShrink: 0 }}>{c.f2}</span>
      <div style={{ flex: 1, minWidth: 0, marginLeft: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{c.amt}</div>
        <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{c.label} · ✓ settled</div>
      </div>
    </div>
  );
}

function ActivityStream() {
  const col = (items, dur, side, offset) => (
    <div style={{ position: 'absolute', top: 0, [side]: -6, width: 192, height: '100%', overflow: 'hidden' }}>
      <div className="olo-rise" style={{ position: 'absolute', top: offset, left: 0, right: 0, animationDuration: dur }}>
        {[...items, ...items].map((c, i) => <React.Fragment key={i}>{ActCard(c)}</React.Fragment>)}
      </div>
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.88 }}>
      {col(FEED_A, '40s', 'left', 0)}
      {col(FEED_B, '54s', 'right', -100)}
    </div>
  );
}

function Landing({ onGetStarted, onSignIn }) {
  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden', background: 'radial-gradient(125% 95% at 50% 0%, #0b1c44 0%, #060f29 55%, #04081a 100%)', color: '#fff' }}>
      <Aurora />
      <ActivityStream />
      {/* readability scrim: dark center + anchored bottom */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'radial-gradient(74% 52% at 50% 44%, rgba(4,8,26,.96) 30%, rgba(4,8,26,.7) 55%, transparent 84%), linear-gradient(to top, #04081a 5%, transparent 30%)' }} />

      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column', padding: '18px 22px 30px' }}>
        {/* top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Logo size={30} className="olo-float" />
            <span style={{ fontSize: 16, fontWeight: 700 }}>OlomiPay</span>
          </div>
          <button onClick={onSignIn} style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', padding: '8px 16px', borderRadius: 999, cursor: 'pointer' }}>Sign in</button>
        </div>

        {/* hero */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, borderRadius: 999, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.07)', padding: '7px 15px', fontSize: 12.5, color: '#e2e8f0' }}>
            <span className="olo-pulse-dot" style={{ width: 7, height: 7, borderRadius: 999, background: '#34d399', flexShrink: 0 }} />
            <span><b style={{ color: '#fff', fontWeight: 700 }}>$1.2M</b> moving today</span>
          </div>
          <h1 style={{ fontSize: 47, fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.035em', margin: '20px 0 0' }}>
            Send money<br />like you <span className="olo-gradient-text">chat</span>.
          </h1>
          <p style={{ fontSize: 15.5, color: 'rgba(203,213,225,.85)', maxWidth: 290, margin: '16px 0 0', lineHeight: 1.5 }}>
            Deposit, send and cash out in seconds — right inside the conversation.
          </p>
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <button onClick={onGetStarted} className="olo-glow" style={{ width: '100%', maxWidth: 340, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, border: 0, background: 'linear-gradient(to right,#3b82f6,#22c55e)', color: '#fff', fontSize: 16, fontWeight: 700, padding: '17px 30px', cursor: 'pointer' }}>
            Get started — it's free <Icon name="arrowright" size={18} stroke={2.4} />
          </button>
          <p style={{ fontSize: 12, color: 'rgba(148,163,184,.9)', margin: 0 }}>1% flat · settles in seconds · end-to-end encrypted</p>
        </div>
      </div>
    </div>
  );
}

function Login({ onBack, onSignIn, onRegister }) {
  const [phone, setPhone] = React.useState('+255 712 345 678');
  const [pin, setPin] = React.useState('');
  const setDigit = i => {
    if (pin.length < 6) setPin(pin + i);
  };
  const back = () => setPin(pin.slice(0, -1));
  const ready = pin.length === 6 && phone.length >= 11;
  return (
    <div className="olo-scroll" style={{ position: 'relative', height: '100%', overflowY: 'auto', background: '#060b18', color: '#fff' }}>
      <Aurora />
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 22px' }}>
        <div onClick={onBack} style={{ position: 'absolute', left: 16, top: 18, cursor: 'pointer', color: '#94a3b8' }}><Icon name="arrowleft" size={22} /></div>
        <div style={{ width: '100%', maxWidth: 320 }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
              <div className="olo-glow-ring" style={{ inset: -10, borderRadius: 24 }} />
              <div className="olo-float" style={{ position: 'relative', width: 64, height: 64, borderRadius: 22, background: 'linear-gradient(to bottom right,#3b82f6,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 18px 40px -10px rgba(34,197,94,.5)' }}>
                <Logo size={36} style={{ filter: 'brightness(0) invert(1)' }} />
              </div>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Welcome back</h1>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>Sign in to keep the conversation going</p>
          </div>

          <div className="olo-glass" style={{ borderRadius: 24, padding: 20 }}>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Phone number</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 16, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', padding: '0 14px', marginBottom: 16 }}>
              <Icon name="phone" size={17} style={{ color: '#60a5fa' }} />
              <input value={phone} onChange={e => setPhone(e.target.value)} style={{ flex: 1, background: 'transparent', border: 0, outline: 0, color: '#fff', fontSize: 16, padding: '13px 0' }} />
            </div>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 10 }}>Your PIN</label>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ width: 38, height: 46, borderRadius: 14, border: `2px solid ${i < pin.length ? '#3b82f6' : 'rgba(255,255,255,.1)'}`, background: 'rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>{i < pin.length ? '•' : ''}</div>
              ))}
            </div>
            <button onClick={() => ready && onSignIn()} className={ready ? 'olo-glow' : ''} style={{ width: '100%', borderRadius: 16, border: 0, background: 'linear-gradient(to right,#3b82f6,#22c55e)', color: '#fff', fontSize: 15, fontWeight: 600, padding: '14px 0', cursor: ready ? 'pointer' : 'not-allowed', opacity: ready ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              Sign in <Icon name="arrowright" size={17} stroke={2.2} />
            </button>
          </div>

          {/* Numeric keypad */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 16 }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
              <button key={i} onClick={() => k === '⌫' ? back() : k && setDigit(k)} disabled={!k}
                style={{ padding: '12px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,.08)', background: k ? 'rgba(255,255,255,.04)' : 'transparent', color: '#fff', fontSize: 18, fontWeight: 600, cursor: k ? 'pointer' : 'default' }}>{k}</button>
            ))}
          </div>

          <div onClick={onRegister} style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', marginTop: 18, cursor: 'pointer' }}>
            New to OlomiPay? <span style={{ fontWeight: 600, background: 'linear-gradient(to right,#60a5fa,#34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Create an account</span>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Landing, Login, Aurora });
