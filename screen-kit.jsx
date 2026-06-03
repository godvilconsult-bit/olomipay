/* OlomiPay UI Kit — shared screen primitives used across the secondary screens. */

/* Sticky frosted page header with back arrow (matches app pattern) */
function ScreenHeader({ title, onBack, right }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(255,255,255,.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid #f1f5f9', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <button onClick={onBack} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#334155', padding: 0, display: 'flex', width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}><Icon name="arrowleft" size={22} /></button>
      <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: '#0f172a', flex: 1 }}>{title}</h1>
      {right}
    </div>
  );
}

/* Pill badge (e.g. "4.5% APY") */
function Pill({ children, bg = 'rgba(22,163,74,.1)', fg = '#16a34a', style = {} }) {
  return <span style={{ background: bg, color: fg, fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, ...style }}>{children}</span>;
}

/* Solid white app card (in-app screens use opaque cards, not the glass landing card) */
function Panel({ children, style = {}, onClick }) {
  return <div onClick={onClick} style={{ background: '#fff', borderRadius: 24, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,.04)', border: '1px solid #f1f5f9', ...style }}>{children}</div>;
}

/* Centered success screen shared by every confirm flow */
function SuccessState({ emoji, icon, title, body, ctaLabel = 'Back to home', onCta, accent = '#16a34a', extra }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px', background: '#f8fafc' }}>
      <div style={{ maxWidth: 320, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <div style={{ width: 80, height: 80, borderRadius: 999, background: accent + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, color: accent }}>
          {emoji || <Icon name={icon || 'checkcircle'} size={40} />}
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: '#0f172a' }}>{title}</h2>
        <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{body}</p>
        {extra}
        <Button variant="primary" full onClick={onCta} style={{ marginTop: 4 }}>{ctaLabel}</Button>
      </div>
    </div>
  );
}

/* Segmented control. variant 'pill' (inside a slate track) or 'underline' (tabs). */
function Segmented({ tabs, value, onChange, variant = 'pill' }) {
  if (variant === 'underline') {
    return (
      <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', background: '#fff', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.value} onClick={() => onChange(t.value)} style={{ flex: '1 0 auto', padding: '12px 14px', fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', border: 0, borderBottom: `2px solid ${value === t.value ? '#1a56db' : 'transparent'}`, background: 'none', color: value === t.value ? '#1a56db' : '#94a3b8', cursor: 'pointer' }}>{t.label}</button>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 16, padding: 4 }}>
      {tabs.map(t => (
        <button key={t.value} onClick={() => onChange(t.value)} style={{ flex: 1, padding: '9px 0', borderRadius: 12, fontSize: 13.5, fontWeight: 600, border: 0, cursor: 'pointer', background: value === t.value ? '#fff' : 'transparent', color: value === t.value ? '#0f172a' : '#64748b', boxShadow: value === t.value ? '0 1px 2px rgba(15,23,42,.08)' : 'none' }}>{t.label}</button>
      ))}
    </div>
  );
}

/* Filter chips row */
function Chips({ items, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }} className="olo-scroll">
      {items.map(it => (
        <button key={it.value} onClick={() => onChange(it.value)} style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, border: 0, cursor: 'pointer', background: value === it.value ? '#1a56db' : '#f1f5f9', color: value === it.value ? '#fff' : '#64748b' }}>{it.label}</button>
      ))}
    </div>
  );
}

/* Labeled text input */
function Field({ label, value, onChange, placeholder, type = 'text', big, suffix, autoFocus }) {
  return (
    <div>
      {label && <label style={{ fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 6 }}>{label}</label>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: '0 14px' }}>
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} autoFocus={autoFocus}
          style={{ flex: 1, border: 0, outline: 0, background: 'transparent', fontSize: big ? 26 : 16, fontWeight: big ? 700 : 400, padding: big ? '14px 0' : '13px 0', color: '#0f172a', width: '100%' }} />
        {suffix}
      </div>
    </div>
  );
}

/* 6-digit PIN entry: dots + numeric keypad. Calls onComplete when 6 reached. */
function PinEntry({ value, onChange, label = 'Enter PIN to confirm', accent = '#1a56db' }) {
  const press = k => { if (k === '⌫') onChange(value.slice(0, -1)); else if (value.length < 6) onChange(value + k); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: '100%' }}>
      <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{label}</p>
      <div style={{ display: 'flex', gap: 12 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ width: 14, height: 14, borderRadius: 999, background: i < value.length ? accent : '#e2e8f0', transition: 'background .15s' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, width: '100%', maxWidth: 280 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
          <button key={i} onClick={() => k && press(k)} disabled={!k} style={{ padding: '15px 0', borderRadius: 14, border: 0, background: k ? '#f1f5f9' : 'transparent', color: '#0f172a', fontSize: 19, fontWeight: 600, cursor: k ? 'pointer' : 'default' }}>{k}</button>
        ))}
      </div>
    </div>
  );
}

/* Dark gradient summary card used at the top of confirm steps */
function ConfirmCard({ label, value, sub }) {
  return (
    <div style={{ width: '100%', borderRadius: 20, padding: 20, textAlign: 'center', background: 'linear-gradient(to bottom right,#1a3a6b,#1a56db)', color: '#fff' }}>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 30, fontWeight: 700, margin: 0 }}>{value}</p>
      {sub && <p style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  );
}

/* Scrollable screen body wrapper with bottom-nav padding */
function ScreenBody({ children, pad = true }) {
  return <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
    <div style={{ maxWidth: 448, margin: '0 auto', padding: pad ? '16px 16px 0' : 0, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
  </div>;
}

const fmt$ = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTZS = n => 'TZS ' + Math.round(n).toLocaleString('en-US');

Object.assign(window, { ScreenHeader, Pill, Panel, SuccessState, Segmented, Chips, Field, PinEntry, ConfirmCard, ScreenBody, fmt$, fmtTZS });
