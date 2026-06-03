/* OlomiPay UI Kit — authenticated app screens (light "airy" skin). */

/* Frosted page header */
function AppHeader({ children }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(248,250,252,.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', padding: '16px 18px 10px' }}>
      {children}
    </div>
  );
}

const TXNS = [
  { id: 1, type: 'RECEIVE', status: 'CONFIRMED', amount: 24, label: 'Received from Amina', ago: '2m ago' },
  { id: 2, type: 'DEPOSIT', status: 'CONFIRMED', amount: 120, ago: '3h ago' },
  { id: 3, type: 'SEND', status: 'PENDING', amount: 8, label: 'Sent to Joseph', ago: '5h ago' },
  { id: 4, type: 'WITHDRAWAL', status: 'FAILED', amount: 50, ago: '3d ago' },
];

function Dashboard({ onNav, onAction, balance, onBell }) {
  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 90 }}>
      <AppHeader>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Good day,</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>+255 712 345 678</div>
          </div>
          <button onClick={onBell} style={{ width: 44, height: 44, borderRadius: 999, background: '#fff', border: 0, boxShadow: '0 1px 2px rgba(15,23,42,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569', position: 'relative' }}>
            <Icon name="bell" size={20} />
            <span style={{ position: 'absolute', top: 9, right: 11, width: 8, height: 8, borderRadius: 999, background: '#ef4444', border: '1.5px solid #fff' }} />
          </button>
        </div>
      </AppHeader>

      <div style={{ padding: '8px 18px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <BalanceCard usd={balance} />

        <section>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#64748b', margin: '0 0 12px' }}>Quick actions</h2>
          <QuickActions onAction={onAction} />
        </section>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#64748b', margin: 0 }}>Recent</h2>
            <span style={{ fontSize: 12, color: '#1a56db', fontWeight: 500 }}>View all</span>
          </div>
          <Card style={{ padding: '4px 16px' }}>
            {TXNS.map((tx, i) => <TransactionItem key={tx.id} tx={tx} last={i === TXNS.length - 1} />)}
          </Card>
        </section>

        <Card onClick={() => {}} style={{ background: 'rgba(254,243,199,.7)', border: '1px solid #fde68a', cursor: 'pointer', padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#b45309' }}>⚠️ Complete KYC to increase your limits</div>
          <div style={{ fontSize: 12, color: 'rgba(180,83,9,.7)', marginTop: 2 }}>Tap to verify your identity →</div>
        </Card>
      </div>
    </div>
  );
}

/* ── Chat list ──────────────────────────────────────────────────────────── */
const CONVOS = [
  { id: 'amina', name: 'Amina', online: true, unread: 2, ago: '2m', preview: '🔒 Encrypted message' },
  { id: 'joseph', name: 'Joseph M.', online: false, unread: 0, ago: '1h', preview: '🔒 Encrypted message' },
  { id: 'chama', name: 'Kijiji Chama', online: true, unread: 5, ago: '3h', preview: '🔒 Encrypted message' },
  { id: 'fatma', name: 'Fatma', online: false, unread: 0, ago: '1d', preview: 'Tap to start chatting' },
];

function ChatList({ onNav, onOpen, unread }) {
  const [filter, setFilter] = React.useState('all');
  const list = filter === 'unread' ? CONVOS.filter(c => c.unread > 0) : CONVOS;
  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 90, background: '#f8fafc' }}>
      <AppHeader>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', flex: 1, margin: 0, color: '#0f172a' }}>Chats</h1>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(59,130,246,.1)', color: '#2563eb', border: 0, padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Icon name="userplus" size={14} /> Invite
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 999, background: 'rgba(203,213,225,.45)', padding: '10px 16px', marginBottom: 10 }}>
          <Icon name="search" size={16} style={{ color: '#94a3b8' }} />
          <span style={{ fontSize: 14, color: '#94a3b8' }}>Search chats</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups']].map(([f, l]) => (
            <button key={f} onClick={() => setFilter(f)} style={{ borderRadius: 999, padding: '7px 14px', fontSize: 12, fontWeight: 600, border: 0, cursor: 'pointer',
              background: filter === f ? 'linear-gradient(to right,#3b82f6,#22c55e)' : 'rgba(203,213,225,.45)', color: filter === f ? '#fff' : '#64748b' }}>{l}</button>
          ))}
        </div>
      </AppHeader>

      <div>
        {list.map(c => (
          <button key={c.id} onClick={() => onOpen(c)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', border: 0, borderBottom: '1px solid #f1f5f9', background: 'none', textAlign: 'left', cursor: 'pointer' }}>
            <Avatar name={c.name} online={c.online} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                <span style={{ fontSize: 14, fontWeight: c.unread ? 700 : 500, color: '#0f172a' }}>{c.name}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{c.ago}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>{c.preview}</span>
                {c.unread > 0 && <span style={{ background: '#1a56db', color: '#fff', fontSize: 10, fontWeight: 700, width: 20, height: 20, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.unread}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Chat thread (with in-thread money send) ────────────────────────────── */
function ChatThread({ convo, onBack, onSendMoney }) {
  const [msgs, setMsgs] = React.useState([
    { id: 1, from: 'them', text: 'Habari! Did you get home okay?' },
    { id: 2, from: 'me', text: 'Yes! Thanks for lunch 😄' },
    { id: 3, from: 'them', text: 'Lunch was 8 bucks btw' },
  ]);
  const [text, setText] = React.useState('');
  const [showMoney, setShowMoney] = React.useState(false);
  const [customAmt, setCustomAmt] = React.useState('');
  const scrollRef = React.useRef(null);
  React.useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs]);

  const send = () => { if (!text.trim()) return; setMsgs(m => [...m, { id: Date.now(), from: 'me', text }]); setText(''); };
  const sendMoney = amt => {
    setShowMoney(false);
    setCustomAmt('');
    setMsgs(m => [...m, { id: Date.now(), from: 'me', money: amt }]);
    onSendMoney && onSendMoney(amt);
  };
  const customNum = parseFloat(customAmt || '0');

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'rgba(248,250,252,.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid #f1f5f9' }}>
        <button onClick={onBack} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#334155', padding: 0 }}><Icon name="arrowleft" size={22} /></button>
        <Avatar name={convo.name} online={convo.online} size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{convo.name}</div>
          <div style={{ fontSize: 11, color: convo.online ? '#16a34a' : '#94a3b8' }}>{convo.online ? '● online' : 'last seen 1h ago'}</div>
        </div>
        <Icon name="lock" size={15} style={{ color: '#94a3b8' }} />
      </div>

      {/* messages */}
      <div ref={scrollRef} className="olo-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 8,
        background: 'radial-gradient(900px 500px at 10% -10%,rgba(59,130,246,.08),transparent 60%),radial-gradient(800px 400px at 110% 10%,rgba(16,185,129,.08),transparent 55%)' }}>
        <div style={{ textAlign: 'center', margin: '4px 0 8px' }}>
          <span style={{ fontSize: 11, color: '#94a3b8', background: 'rgba(255,255,255,.7)', padding: '4px 12px', borderRadius: 999 }}>🔒 Messages are end-to-end encrypted</span>
        </div>
        {msgs.map(m => m.money !== undefined ? (
          <div key={m.id} className="olo-msg-right" style={{ marginLeft: 'auto', maxWidth: '78%', borderRadius: '18px 18px 6px 18px', padding: 2, background: 'linear-gradient(to bottom right,#3b82f6,#22c55e)' }}>
            <div style={{ borderRadius: 16, background: '#0b1426', padding: '12px 16px', color: '#fff' }}>
              <div style={{ fontSize: 11, color: '#6ee7b7' }}>💸 You sent</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>${m.money.toFixed(2)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                <Icon name="check" size={12} stroke={3} style={{ color: '#34d399' }} /> Settled on-chain · 0.8s
              </div>
            </div>
          </div>
        ) : (
          <div key={m.id} className={m.from === 'me' ? 'olo-msg-right' : 'olo-msg-left'} style={{
            alignSelf: m.from === 'me' ? 'flex-end' : 'flex-start', maxWidth: '78%', padding: '9px 14px', fontSize: 14, lineHeight: 1.4,
            borderRadius: m.from === 'me' ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
            background: m.from === 'me' ? 'linear-gradient(to right,#3b82f6,#22c55e)' : '#fff',
            color: m.from === 'me' ? '#fff' : '#0f172a',
            boxShadow: m.from === 'me' ? 'none' : '0 1px 2px rgba(15,23,42,.06)' }}>{m.text}</div>
        ))}
      </div>

      {/* money send popover — full-width bar on phones, compact bottom-left card on tablet/desktop */}
      {showMoney && (
        <React.Fragment>
          <div onClick={() => setShowMoney(false)} style={{ position: 'absolute', inset: 0, zIndex: 15 }} />
          <div className="olo-money-pop">
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, fontWeight: 500 }}>Send to {convo.name}</div>
            {/* custom amount */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '0 10px', marginBottom: 10 }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: '#1a56db' }}>$</span>
              <input value={customAmt} onChange={e => setCustomAmt(e.target.value.replace(/[^0-9.]/g, ''))} onKeyDown={e => e.key === 'Enter' && customNum > 0 && sendMoney(customNum)}
                placeholder="Custom amount" inputMode="decimal" autoFocus
                style={{ flex: 1, border: 0, outline: 0, fontSize: 16, fontWeight: 600, padding: '10px 0', background: 'transparent', color: '#0f172a', minWidth: 0, width: '100%' }} />
              <button onClick={() => customNum > 0 && sendMoney(customNum)} disabled={customNum <= 0}
                style={{ border: 0, borderRadius: 10, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: customNum > 0 ? 'pointer' : 'not-allowed', color: '#fff', flexShrink: 0, opacity: customNum > 0 ? 1 : 0.4, background: 'linear-gradient(to right,#3b82f6,#22c55e)' }}>Send</button>
            </div>
            {/* quick chips */}
            <div style={{ display: 'flex', gap: 8 }}>
              {[5, 8, 20, 50].map(a => (
                <button key={a} onClick={() => sendMoney(a)} style={{ flex: 1, padding: '9px 0', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 14, fontWeight: 700, color: '#1a56db', cursor: 'pointer' }}>${a}</button>
              ))}
            </div>
          </div>
        </React.Fragment>
      )}

      {/* composer */}
      <div style={{ position: 'relative', zIndex: 16, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#fff', borderTop: '1px solid #f1f5f9' }}>
        <button onClick={() => setShowMoney(s => !s)} title="Send money" style={{ width: 40, height: 40, borderRadius: 999, border: 0, flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: showMoney ? 'linear-gradient(to bottom right,#3b82f6,#22c55e)' : '#f1f5f9', color: showMoney ? '#fff' : '#1a56db' }}>
          <Icon name="dollar" size={19} stroke={2.4} />
        </button>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Type a message…"
          style={{ flex: 1, border: 0, outline: 0, background: '#f1f5f9', borderRadius: 999, padding: '11px 16px', fontSize: 16 }} />
        <button onClick={send} style={{ width: 40, height: 40, borderRadius: 999, border: 0, flexShrink: 0, cursor: 'pointer', background: 'linear-gradient(to bottom right,#3b82f6,#22c55e)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="send" size={18} />
        </button>
      </div>
    </div>
  );
}

/* ── Send money screen ──────────────────────────────────────────────────── */
function SendScreen({ onBack, onConfirm, balance }) {
  const [amt, setAmt] = React.useState('');
  const num = parseFloat(amt || '0');
  const fee = num * 0.01;
  const net = num - fee;
  const press = k => { if (k === '⌫') setAmt(a => a.slice(0, -1)); else if (k === '.') { if (!amt.includes('.')) setAmt(a => (a || '0') + '.'); } else setAmt(a => (a + k).replace(/^0(?=\d)/, '')); };
  const ready = num > 0 && num <= balance;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
        <button onClick={onBack} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#334155', padding: 0 }}><Icon name="arrowleft" size={22} /></button>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>Send money</h1>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Avatar name="Amina" online size={44} />
          <div><div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Amina</div><div style={{ fontSize: 12, color: '#94a3b8' }}>+255 712 •• 678</div></div>
        </div>
        <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: '-0.03em', color: num ? '#0f172a' : '#cbd5e1' }}>${amt || '0'}</div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>≈ TZS {Math.round(num * 2600).toLocaleString()}</div>
        {num > 0 && (
          <div style={{ marginTop: 16, display: 'flex', gap: 18, fontSize: 12, color: '#64748b' }}>
            <span>Fee 1% · <b style={{ color: '#d97706' }}>${fee.toFixed(2)}</b></span>
            <span>They get · <b style={{ color: '#16a34a' }}>${net.toFixed(2)}</b></span>
          </div>
        )}
        {num > balance && <div style={{ marginTop: 12, fontSize: 12, color: '#dc2626' }}>Amount exceeds your ${balance.toFixed(2)} balance</div>}
      </div>

      <div style={{ padding: '0 24px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => (
            <button key={k} onClick={() => press(k)} style={{ padding: '14px 0', borderRadius: 14, border: 0, background: 'transparent', fontSize: 22, fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>{k}</button>
          ))}
        </div>
        <Button variant="primary" full disabled={!ready} onClick={() => ready && onConfirm(num)}>
          Send ${num ? net.toFixed(2) : '0.00'} <Icon name="arrowright" size={17} stroke={2.2} />
        </Button>
      </div>
    </div>
  );
}

/* ── Generic "coming soon" stub for More-sheet items ────────────────────── */
function Placeholder({ title, onBack }) {
  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 90, background: '#f8fafc' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
        <button onClick={onBack} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#334155', padding: 0 }}><Icon name="arrowleft" size={22} /></button>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>{title}</h1>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '70%', textAlign: 'center', color: '#94a3b8', padding: 24 }}>
        <Logo size={48} style={{ opacity: 0.4, marginBottom: 16 }} />
        <p style={{ fontSize: 14, maxWidth: 220 }}>This screen isn't part of the UI kit recreation — only the core flows are built out.</p>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, ChatList, ChatThread, SendScreen, Placeholder, AppHeader });
