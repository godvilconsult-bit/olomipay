/* OlomiPay UI Kit — shared components. Mirrors frontend/components/* from the codebase. */

const LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
  '<path d="M100 15 A85 85 0 1 1 15 100" fill="none" stroke="#1a3a6b" stroke-width="18" stroke-linecap="round"/>' +
  '<path d="M100 30 A70 70 0 1 1 30 100" fill="none" stroke="#1a56db" stroke-width="10" stroke-linecap="round"/>' +
  '<path d="M40 130 Q80 170 150 90" fill="none" stroke="#10b981" stroke-width="16" stroke-linecap="round"/>' +
  '<polygon points="150,90 130,78 148,70" fill="#10b981"/></svg>'
);

function Logo({ size = 36, className = '', style = {} }) {
  return <img src={LOGO} width={size} height={size} alt="OlomiPay" className={className} style={style} />;
}

/* ── Button ─────────────────────────────────────────────────────────────── */
function Button({ variant = 'primary', children, onClick, disabled, full, className = '', style = {} }) {
  const base = {
    minHeight: 48, padding: '0 24px', borderRadius: 16, fontWeight: 600, fontSize: 15,
    border: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    cursor: disabled ? 'not-allowed' : 'pointer', width: full ? '100%' : undefined,
    opacity: disabled ? 0.4 : 1, fontFamily: 'inherit', transition: 'transform .1s',
    WebkitTapHighlightColor: 'transparent',
  };
  const skins = {
    primary:   { background: 'linear-gradient(to right,#3b82f6,#22c55e)', color: '#fff', boxShadow: '0 10px 25px -5px rgba(26,86,219,.25)' },
    secondary: { background: '#f1f5f9', color: '#0f172a' },
    danger:    { background: '#dc2626', color: '#fff' },
    ghost:     { background: 'rgba(255,255,255,.05)', color: '#fff', border: '1px solid rgba(255,255,255,.15)' },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseDown={e => !disabled && (e.currentTarget.style.transform = 'scale(0.96)')}
      onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      style={{ ...base, ...skins[variant], ...style }} className={className}>
      {children}
    </button>
  );
}

/* ── Card (light app glass) ─────────────────────────────────────────────── */
function Card({ children, className = '', style = {}, onClick }) {
  return (
    <div onClick={onClick} className={className} style={{
      background: 'rgba(255,255,255,.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,.6)', borderRadius: 24, padding: 20,
      boxShadow: '0 8px 30px -12px rgba(30,58,138,.18)', ...style,
    }}>{children}</div>
  );
}

/* ── Status badge ───────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    CONFIRMED: ['rgba(22,163,74,.1)', '#16a34a'],
    PENDING:   ['rgba(217,119,6,.1)', '#d97706'],
    FAILED:    ['rgba(220,38,38,.1)', '#dc2626'],
  };
  const [bg, fg] = map[status] || map.PENDING;
  return <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 500, padding: '2px 9px', borderRadius: 999 }}>{status}</span>;
}

/* ── Avatar (deterministic color from name) ─────────────────────────────── */
const AV_COLORS = ['#1a56db', '#a855f7', '#14b8a6', '#f97316', '#ec4899', '#6366f1'];
function Avatar({ name, online, size = 48 }) {
  const color = AV_COLORS[(name?.charCodeAt(0) ?? 0) % AV_COLORS.length];
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: 999, background: color, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.3 }}>
        {(name ?? '?').slice(0, 2).toUpperCase()}
      </div>
      {online !== undefined && (
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 999,
          border: '2px solid #fff', background: online ? '#22c55e' : '#cbd5e1' }} />
      )}
    </div>
  );
}

/* ── Balance card ───────────────────────────────────────────────────────── */
function BalanceCard({ usd = 1284.5, rate = 2600, coins = 412.66 }) {
  const [hidden, setHidden] = React.useState(false);
  const [spin, setSpin] = React.useState(false);
  const fmtUsd = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtTzs = n => 'TZS ' + Math.round(n).toLocaleString('en-US');
  const refresh = () => { setSpin(true); setTimeout(() => setSpin(false), 700); };
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 22, color: '#fff',
      background: 'linear-gradient(to bottom right,#1a3a6b,#1a56db)', boxShadow: '0 8px 30px -12px rgba(30,58,138,.4)' }}>
      <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, background: 'rgba(255,255,255,.05)', borderRadius: '50%' }} />
      <div style={{ position: 'absolute', bottom: -32, left: -32, width: 128, height: 128, background: 'rgba(255,255,255,.05)', borderRadius: '50%' }} />
      <img src={LOGO} style={{ position: 'absolute', right: -16, bottom: -16, width: 96, height: 96, opacity: 0.1 }} alt="" />
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,.8)' }}>
            <Logo size={20} /> Olomi Wallet
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={refresh} style={ibtn}><Icon name="refresh" size={14} style={{ animation: spin ? 'olo-spin 0.7s linear' : 'none' }} /></button>
            <button onClick={() => setHidden(h => !h)} style={ibtn}><Icon name={hidden ? 'eyeoff' : 'eye'} size={14} /></button>
          </div>
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {hidden ? '••••••' : fmtUsd(usd)}<span style={{ fontSize: 18, fontWeight: 500, opacity: 0.7, marginLeft: 8 }}>USD</span>
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>≈ {hidden ? '•••' : fmtTzs(usd * rate)}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 16 }}>
          {hidden ? '••' : coins.toFixed(2) + ' coins'} · OlomiPay · Building Trust Through Blockchain
        </div>
      </div>
    </div>
  );
}
const ibtn = { width: 30, height: 30, borderRadius: 999, background: 'rgba(255,255,255,.1)', border: 0, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };

/* ── Quick actions ──────────────────────────────────────────────────────── */
function QuickActions({ onAction }) {
  const acts = [
    { id: 'send',     label: 'Send',     icon: 'send',           bg: '#dbeafe', fg: '#2563eb' },
    { id: 'deposit',  label: 'Deposit',  icon: 'depositcircle',  bg: '#dcfce7', fg: '#16a34a' },
    { id: 'withdraw', label: 'Withdraw', icon: 'withdrawcircle', bg: '#fef3c7', fg: '#d97706' },
    { id: 'history',  label: 'History',  icon: 'clock',          bg: '#f1f5f9', fg: '#64748b' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
      {acts.map(a => (
        <button key={a.id} onClick={() => onAction && onAction(a.id)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ width: '100%', aspectRatio: '1', maxWidth: 64, borderRadius: 16, background: a.bg, color: a.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={a.icon} size={24} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#334155' }}>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Transaction item ───────────────────────────────────────────────────── */
const TX_META = {
  RECEIVE:    { label: 'Received',              icon: 'arrowdownleft', bg: 'rgba(22,163,74,.1)',  fg: '#16a34a', sign: '+' },
  SEND:       { label: 'Sent',                  icon: 'arrowupright',  bg: 'rgba(26,86,219,.1)',  fg: '#1a56db', sign: '-' },
  DEPOSIT:    { label: 'Mobile Money Deposit',  icon: 'arrowdownleft', bg: 'rgba(22,163,74,.1)',  fg: '#16a34a', sign: '+' },
  WITHDRAWAL: { label: 'Withdraw to Mobile Money', icon: 'arrowupright', bg: 'rgba(217,119,6,.1)', fg: '#d97706', sign: '-' },
};
function TransactionItem({ tx, last }) {
  const m = TX_META[tx.type];
  const failed = tx.status === 'FAILED';
  const sign = failed ? '' : m.sign;
  const amt = sign + '$' + Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amtColor = failed ? '#94a3b8' : m.sign === '-' ? '#334155' : '#16a34a';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 4px', borderBottom: last ? 0 : '1px solid #f1f5f9' }}>
      <div style={{ width: 40, height: 40, borderRadius: 16, background: m.bg, color: m.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: failed ? 0.5 : 1 }}>
        <Icon name={m.icon} size={18} stroke={2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{tx.label || m.label}</span>
          <StatusBadge status={tx.status} />
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{tx.ago}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, flexShrink: 0, color: amtColor, textDecoration: failed ? 'line-through' : 'none' }}>{amt}</div>
    </div>
  );
}

/* ── Bottom nav ─────────────────────────────────────────────────────────── */
function BottomNav({ active, unread = 0, onNav }) {
  const tabs = [
    { id: 'dashboard', label: 'Home',    icon: 'home' },
    { id: 'chat',      label: 'Chat',    icon: 'message', badge: true },
    { id: 'send',      label: 'Send',    icon: 'send' },
    { id: 'savings',   label: 'Savings', icon: 'piggy' },
    { id: 'more',      label: 'More',    icon: 'more' },
  ];
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 12px 12px', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 4, pointerEvents: 'auto',
        borderRadius: 30, border: '1px solid rgba(0,0,0,.05)', background: 'rgba(255,255,255,.7)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '6px 8px', boxShadow: '0 8px 30px -8px rgba(0,0,0,.25)' }}>
        {tabs.map(t => {
          const on = active === t.id;
          return (
            <button key={t.id} onClick={() => onNav(t.id)} style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0', borderRadius: 16, border: 0, background: 'none', cursor: 'pointer', color: on ? '#fff' : '#64748b' }}>
              {on && <span style={{ position: 'absolute', inset: '2px 8px', borderRadius: 16, zIndex: 0, background: 'linear-gradient(to bottom right,#3b82f6,#22c55e)', boxShadow: '0 6px 16px -4px rgba(26,86,219,.4)' }} />}
              <span style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ position: 'relative' }}>
                  <Icon name={t.icon} size={21} stroke={on ? 2.4 : 1.8} />
                  {t.badge && unread > 0 && (
                    <span style={{ position: 'absolute', top: -6, right: -8, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, minWidth: 16, height: 16, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff' }}>{unread}</span>
                  )}
                </span>
                <span style={{ fontSize: 10, fontWeight: 500 }}>{t.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { Logo, LOGO, Button, Card, StatusBadge, Avatar, BalanceCard, QuickActions, TransactionItem, BottomNav });
