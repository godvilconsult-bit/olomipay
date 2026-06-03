/* OlomiPay UI Kit — account & utility: History, Profile, Notifications, Card, Credit, Merchant, Chama. */

const HISTORY = [
  { id: 1, type: 'RECEIVE', status: 'CONFIRMED', amount: 24, label: 'Received from Amina', ago: '2m ago' },
  { id: 2, type: 'DEPOSIT', status: 'CONFIRMED', amount: 120, ago: '3h ago' },
  { id: 3, type: 'SEND', status: 'PENDING', amount: 8, label: 'Sent to Joseph', ago: '5h ago' },
  { id: 4, type: 'SEND', status: 'CONFIRMED', amount: 12.5, label: 'Sent to Fatma', ago: 'Yesterday' },
  { id: 5, type: 'WITHDRAWAL', status: 'FAILED', amount: 50, ago: '3d ago' },
  { id: 6, type: 'RECEIVE', status: 'CONFIRMED', amount: 60, label: 'Received from Chama', ago: '4d ago' },
  { id: 7, type: 'DEPOSIT', status: 'CONFIRMED', amount: 200, ago: '1w ago' },
];
function HistoryScreen({ onBack }) {
  const [filter, setFilter] = React.useState('ALL');
  const list = filter === 'ALL' ? HISTORY : HISTORY.filter(t => t.type === filter);
  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(255,255,255,.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
          <button onClick={onBack} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#334155', padding: 0, display: 'flex' }}><Icon name="arrowleft" size={22} /></button>
          <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: '#0f172a' }}>Transaction history</h1>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <Chips value={filter} onChange={setFilter} items={[{ value: 'ALL', label: 'All' }, { value: 'DEPOSIT', label: 'Deposits' }, { value: 'SEND', label: 'Sent' }, { value: 'RECEIVE', label: 'Received' }, { value: 'WITHDRAWAL', label: 'Withdraw' }]} />
        </div>
      </div>
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0' }}>
        {list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: '#94a3b8' }}><div style={{ fontSize: 36, marginBottom: 10 }}>📂</div><p style={{ fontWeight: 600, margin: 0 }}>No transactions</p><p style={{ fontSize: 13, marginTop: 4 }}>No {filter.toLowerCase()} transactions yet.</p></div>
        ) : (
          <Panel style={{ padding: '4px 16px' }}>{list.map((tx, i) => <TransactionItem key={tx.id} tx={tx} last={i === list.length - 1} />)}</Panel>
        )}
      </div>
    </div>
  );
}

/* ── NOTIFICATIONS ──────────────────────────────────────────────────────── */
const NOTIFS = {
  Today: [
    { id: 1, emoji: '💚', title: 'Money received', body: 'Umepokea $24.00 kutoka Amina', ago: '2m ago', unread: true },
    { id: 2, emoji: '🌱', title: 'Yield earned', body: 'Your savings earned +$0.04 today', ago: '4h ago', unread: true },
  ],
  Yesterday: [
    { id: 3, emoji: '💸', title: 'Payment sent', body: 'You sent $12.50 to Fatma', ago: '1d ago' },
    { id: 4, emoji: '🔄', title: 'Scheduled transfer', body: 'Rent transfer of $80 is queued for the 1st', ago: '1d ago' },
    { id: 5, emoji: '⚠️', title: 'Low balance', body: 'Your wallet is below $10', ago: '1d ago' },
  ],
};
function NotificationsScreen({ onBack }) {
  const [push, setPush] = React.useState(false);
  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title="Notifications" onBack={onBack} right={<button style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#1a56db', fontWeight: 600, border: 0, background: 'none', cursor: 'pointer' }}><Icon name="checkcircle" size={14} /> All read</button>} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!push && <Panel style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name="bell" size={20} style={{ color: '#1a56db' }} />
            <div style={{ flex: 1 }}><p style={{ fontSize: 13.5, fontWeight: 600, color: '#1d4ed8', margin: 0 }}>Enable notifications</p><p style={{ fontSize: 12, color: 'rgba(37,99,235,.8)', margin: '2px 0 0' }}>Get instant alerts for money movements</p></div>
            <button onClick={() => setPush(true)} style={{ fontSize: 12, background: '#1a56db', color: '#fff', border: 0, padding: '8px 14px', borderRadius: 12, fontWeight: 600, cursor: 'pointer' }}>Enable</button>
          </div>
        </Panel>}
        {Object.entries(NOTIFS).map(([day, items]) => (
          <div key={day}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 8px 2px' }}>{day}</p>
            <Panel style={{ padding: '4px 16px' }}>
              {items.map((n, i) => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: i === items.length - 1 ? 0 : '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 20, marginTop: 1 }}>{n.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: n.unread ? 700 : 500, color: '#0f172a', margin: 0 }}>{n.title}</p>
                    <p style={{ fontSize: 12.5, color: '#64748b', margin: '2px 0 0', lineHeight: 1.4 }}>{n.body}</p>
                    <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '4px 0 0' }}>{n.ago}</p>
                  </div>
                  {n.unread && <div style={{ width: 8, height: 8, borderRadius: 999, background: '#1a56db', marginTop: 6, flexShrink: 0 }} />}
                </div>
              ))}
            </Panel>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── PROFILE ────────────────────────────────────────────────────────────── */
function ProfileScreen({ onBack, onLogout, balance }) {
  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title="Profile" onBack={onBack} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Panel style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 88, height: 88, borderRadius: 999, background: '#1a56db', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, border: '4px solid rgba(26,86,219,.15)' }}>AM</div>
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 999, background: '#1a56db', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Icon name="card" size={13} /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>Amina MwakLima</p></div>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>+255 712 345 678</p>
          <Pill>✓ Verified</Pill>
        </Panel>

        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}><Icon name="card" size={18} style={{ color: '#1a56db' }} /><h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#0f172a' }}>Olomi Wallet</h3><Pill style={{ marginLeft: 'auto' }}>Active</Pill></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ background: '#f8fafc', borderRadius: 16, padding: 12, textAlign: 'center' }}><p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px' }}>USD Balance</p><p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>{fmt$(balance)}</p></div>
            <div style={{ background: '#f8fafc', borderRadius: 16, padding: 12, textAlign: 'center' }}><p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px' }}>Coins Balance</p><p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>412.66</p></div>
          </div>
          <div style={{ background: '#f8fafc', borderRadius: 16, padding: 12 }}>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 4px' }}>Your Wallet ID</p>
            <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11.5, color: '#475569', margin: 0, wordBreak: 'break-all', lineHeight: 1.5 }}>GABC4XYZ7K2MNQWERTYUIOPLKJHGFDSAZXCVBWXYZ</p>
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1a56db', fontWeight: 600, background: 'rgba(26,86,219,.1)', border: 0, padding: '6px 12px', borderRadius: 10, marginTop: 8, cursor: 'pointer' }}><Icon name="copy" size={12} /> Copy ID</button>
          </div>
        </Panel>

        <div style={{ borderRadius: 24, padding: 20, color: '#fff', background: 'linear-gradient(to right,#1a3a6b,#1a56db)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Logo size={22} /><h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Mobile Money → Olomi Wallet</h3></div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', margin: '0 0 12px', lineHeight: 1.5 }}>Deposit via Mobile Money and your money is instantly available. Send, save, or convert anytime.</p>
          {['Go to Deposit → pay via Mobile Money', 'Money is instantly credited to your wallet', 'Send, save for interest, or convert'].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.15)', borderRadius: 12, padding: 10, marginBottom: 6, fontSize: 13 }}><span style={{ width: 20, height: 20, borderRadius: 999, background: 'rgba(255,255,255,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>{s}</div>
          ))}
        </div>

        <Panel style={{ padding: 0, overflow: 'hidden' }}>
          {[['shieldcheck', 'KYC Verification', 'Verify your identity to unlock higher limits'], ['shield', 'Help & support', 'Open a request — our team will help you']].map(([ic, t, d], i) => (
            <button key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '16px 18px', border: 0, borderBottom: '1px solid #f1f5f9', background: 'none', textAlign: 'left', cursor: 'pointer' }}>
              <Icon name={ic} size={18} style={{ color: '#1a56db' }} />
              <div style={{ flex: 1 }}><p style={{ fontSize: 14, fontWeight: 500, color: '#0f172a', margin: 0 }}>{t}</p><p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{d}</p></div>
            </button>
          ))}
          <button onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '16px 18px', border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', color: '#dc2626' }}>
            <Icon name="arrowupright" size={18} style={{ transform: 'rotate(45deg)' }} /><span style={{ fontSize: 14, fontWeight: 500 }}>Sign out</span>
          </button>
        </Panel>
      </div>
    </div>
  );
}

/* ── VIRTUAL CARD ───────────────────────────────────────────────────────── */
function CardScreen({ onBack, onDone }) {
  const [issued, setIssued] = React.useState(true);
  const [frozen, setFrozen] = React.useState(false);
  if (!issued) return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title="Virtual Card" onBack={onBack} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0' }}>
        <Panel style={{ textAlign: 'center', padding: '32px 22px' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>💳</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: '#0f172a' }}>Get a Virtual Card</h2>
          <p style={{ fontSize: 13.5, color: '#64748b', margin: '0 0 16px' }}>Spend your USDC anywhere Visa is accepted online. Linked to your wallet balance.</p>
          <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>{['Instant issuance', 'Spend USDC globally', 'Freeze/unfreeze anytime', 'KYC required'].map(t => <p key={t} style={{ fontSize: 13.5, color: '#475569', margin: 0 }}>✅ {t}</p>)}</div>
          <Button variant="primary" full onClick={() => { setIssued(true); onDone('💳 Virtual card issued!'); }}>Issue my card</Button>
        </Panel>
      </div>
    </div>
  );
  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title="Virtual Card" onBack={onBack} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1.6 / 1', borderRadius: 24, overflow: 'hidden', background: 'linear-gradient(to bottom right,#1e293b,#334155,#0f172a)', filter: frozen ? 'grayscale(1) opacity(0.7)' : 'none', transition: 'filter .3s' }}>
          <div style={{ position: 'absolute', inset: 0, padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>OlomiPay</span>
              {frozen && <Pill bg="#3b82f6" fg="#fff">FROZEN</Pill>}
            </div>
            <div style={{ width: 40, height: 30, borderRadius: 8, background: 'rgba(251,191,36,.85)' }} />
            <div>
              <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 16, fontFamily: 'ui-monospace,monospace', letterSpacing: '.15em', margin: '0 0 6px' }}>•••• •••• •••• 4821</p>
              <p style={{ color: '#fff', fontFamily: 'ui-monospace,monospace', fontSize: 13, margin: 0 }}>09/29 · VISA</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <button onClick={() => { setFrozen(f => !f); onDone(frozen ? 'Card unfrozen' : 'Card frozen'); }} style={{ ...cardBtn3, background: frozen ? '#eff6ff' : '#fff' }}>
            <Icon name={frozen ? 'arrowupright' : 'lock'} size={22} style={{ color: frozen ? '#1a56db' : '#64748b' }} /><span style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a' }}>{frozen ? 'Unfreeze' : 'Freeze'}</span>
          </button>
          <div style={{ ...cardBtn3, cursor: 'default' }}><span style={{ fontSize: 22 }}>💵</span><span style={{ fontSize: 11, color: '#94a3b8' }}>Daily limit</span><span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>$500</span></div>
        </div>
        <Panel style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}><p style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', margin: '0 0 4px' }}>How to use your card</p><p style={{ fontSize: 12, color: 'rgba(37,99,235,.85)', margin: 0, lineHeight: 1.5 }}>Use your card number and expiry for online purchases. Your USDC balance is automatically debited.</p></Panel>
      </div>
    </div>
  );
}

/* ── CREDIT SCORE ───────────────────────────────────────────────────────── */
function CreditScreen({ onBack, onDone }) {
  const score = 68, tier = 'Good standing', color = '#1a56db';
  const dash = (score / 100) * 251;
  const breakdown = [['Base score', 40, false], ['Transaction history', 12, false], ['Account age', 8, false], ['Savings activity', 6, false], ['Staking activity', 4, false], ['Defaults', 0, true]];
  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title="Credit Score" onBack={onBack} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Panel style={{ textAlign: 'center', padding: '24px 18px' }}>
          <div style={{ position: 'relative', width: 144, height: 144, margin: '0 auto' }}>
            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="10" />
              <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="10" strokeDasharray={`${dash} 251`} strokeLinecap="round" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 32, fontWeight: 800, color }}>{score}</span><span style={{ fontSize: 12, color: '#94a3b8' }}>/100</span></div>
          </div>
          <p style={{ fontSize: 17, fontWeight: 700, color, margin: '12px 0 2px' }}>{tier}</p>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>OlomiPay Credit Score</p>
        </Panel>
        <Panel><h3 style={{ fontSize: 14, fontWeight: 600, color: '#64748b', margin: '0 0 14px' }}>Score breakdown</h3>
          {breakdown.map(([label, val, neg]) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}><span style={{ color: '#64748b' }}>{label}</span><span style={{ fontWeight: 600, color: neg ? '#94a3b8' : '#16a34a' }}>{neg ? '' : '+'}{val}</span></div>
              <div style={{ height: 6, background: '#f1f5f9', borderRadius: 999 }}><div style={{ height: '100%', width: `${Math.min(val / 40 * 100, 100)}%`, background: neg ? '#dc2626' : '#16a34a', borderRadius: 999 }} /></div>
            </div>
          ))}
        </Panel>
        <Panel><h3 style={{ fontSize: 14, fontWeight: 600, color: '#64748b', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="shieldcheck" size={14} style={{ color: '#1a56db' }} /> Improve your score</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{['Repay loans on time (+5 pts each)', 'Keep savings active (+5 pts)', 'Transact regularly (+1 pt per 10 txs)', 'Avoid defaults (−20 pts each)'].map(t => <p key={t} style={{ fontSize: 13, color: '#64748b', margin: 0 }}>• {t}</p>)}</div>
        </Panel>
        <Button variant="secondary" full onClick={() => onDone('Share link generated · valid 7 days')}>Generate share link</Button>
      </div>
    </div>
  );
}

/* ── MERCHANT QR ────────────────────────────────────────────────────────── */
function MerchantScreen({ onBack, onDone }) {
  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title="Merchant QR" onBack={onBack} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Panel style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 2px', color: '#0f172a' }}>Mama Paka Duka</h2>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px' }}>Scan to pay with OlomiPay</p>
          <div style={{ width: 196, height: 196, margin: '0 auto', borderRadius: 18, background: '#0f172a', display: 'grid', gridTemplateColumns: 'repeat(11,1fr)', gridTemplateRows: 'repeat(11,1fr)', padding: 14, gap: 2 }}>
            {Array.from({ length: 121 }).map((_, i) => { const s = (i * 53 + 7) % 11; return <div key={i} style={{ background: (s < 5 || i % 7 === 0 || i % 5 === 0) ? '#fff' : 'transparent', borderRadius: 1 }} />; })}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button variant="secondary" full onClick={() => onDone('QR link copied!')}>Copy Link</Button>
            <Button variant="primary" full onClick={() => onDone('Opening print…')}>Print QR</Button>
          </div>
        </Panel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {[['Today', '$84.00', '12 sales'], ['This Week', '$612.50', '83 sales'], ['This Month', '$2,940', '341 sales']].map(([l, v, s]) => (
            <Panel key={l} style={{ textAlign: 'center', padding: 12 }}><p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px' }}>{l}</p><p style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', margin: 0 }}>{v}</p><p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{s}</p></Panel>
          ))}
        </div>
        <Panel><p style={{ fontSize: 13.5, fontWeight: 500, margin: '0 0 10px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="trending" size={14} style={{ color: '#16a34a' }} /> Total Sales: $2,940.00 USDC</p><Button variant="primary" full onClick={() => onDone('Cashing out to Mobile Money…')}>Cash Out to Mobile Money</Button></Panel>
      </div>
    </div>
  );
}

/* ── CHAMA (rotating savings groups) ────────────────────────────────────── */
const CHAMAS = [
  { id: 'c1', name: "Mama's Savings Group", emoji: '🤝', members: 6, round: 2, contribution: 50, status: 'ACTIVE', received: [true, true, false, false, false, false] },
  { id: 'c2', name: 'Boda Riders Fund', emoji: '🏍️', members: 8, round: 0, contribution: 25, status: 'FORMING', received: [false, false, false, false, false, false, false, false] },
];
function ChamaScreen({ onBack, onDone }) {
  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title="Chama Groups" onBack={onBack} right={<button onClick={() => onDone('New Chama — add members to start')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#1a56db', fontWeight: 600, border: 0, background: 'none', cursor: 'pointer' }}><Icon name="plus" size={15} /> New</button>} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ borderRadius: 24, padding: 20, color: '#fff', background: 'linear-gradient(to bottom right,#1a56db,#1e40af)' }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, margin: '0 0 4px' }}>What is a Chama?</p>
          <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,.8)', margin: 0, lineHeight: 1.5 }}>A rotating savings group where members contribute each month and take turns receiving the full pot. Secured by Soroban smart contracts.</p>
        </div>
        {CHAMAS.map(c => {
          const pot = c.contribution * c.members;
          return (
            <Panel key={c.id}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(26,86,219,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{c.emoji}</div>
                <div style={{ flex: 1 }}><p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: 0 }}>{c.name}</p><p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{c.members} members · Round {c.round + 1}</p></div>
                <Pill bg={c.status === 'ACTIVE' ? 'rgba(22,163,74,.1)' : 'rgba(217,119,6,.1)'} fg={c.status === 'ACTIVE' ? '#16a34a' : '#d97706'}>{c.status}</Pill>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 16, padding: 12, marginBottom: 14 }}>
                <div><p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px' }}>Each contributes</p><p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>{fmt$(c.contribution)}</p></div>
                <div style={{ textAlign: 'right' }}><p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px' }}>Total pot</p><p style={{ fontSize: 15, fontWeight: 700, color: '#16a34a', margin: 0 }}>{fmt$(pot)}</p></div>
              </div>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 8px' }}>Members</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {c.received.map((r, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, padding: '4px 9px', borderRadius: 999, background: r ? 'rgba(22,163,74,.1)' : '#f1f5f9', color: r ? '#16a34a' : '#64748b' }}>
                    <Icon name={r ? 'check' : 'clock'} size={10} stroke={r ? 3 : 2} /> {`••${String(20 + i * 7).padStart(2, '0')}`}
                  </span>
                ))}
              </div>
              <Button variant="primary" full onClick={() => onDone(`Contributed ${fmt$(c.contribution)} to ${c.name}`)}>Contribute {fmt$(c.contribution)}</Button>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

/* ── PAYROLL (employer bulk pay) ────────────────────────────────────────── */
function PayrollScreen({ onBack, onDone }) {
  const team = [['Joseph M.', 'Driver', 180], ['Fatma A.', 'Shopkeeper', 150], ['Daniel K.', 'Mechanic', 200], ['Grace N.', 'Accountant', 260]];
  const total = team.reduce((s, t) => s + t[2], 0);
  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title="Payroll" onBack={onBack} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ borderRadius: 24, padding: 20, color: '#fff', background: 'linear-gradient(to bottom right,#0f766e,#0891b2)' }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', margin: '0 0 2px' }}>This month's run · {team.length} people</p>
          <p style={{ fontSize: 30, fontWeight: 700, margin: 0 }}>{fmt$(total)}</p>
          <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,.7)', margin: '4px 0 0' }}>Paid instantly in USDC · 1% fee {fmt$(total * 0.01)}</p>
        </div>
        <Panel style={{ padding: '4px 16px' }}>
          {team.map(([nm, role, amt], i) => (
            <div key={nm} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i === team.length - 1 ? 0 : '1px solid #f1f5f9' }}>
              <Avatar name={nm} size={40} />
              <div style={{ flex: 1 }}><p style={{ fontSize: 14, fontWeight: 500, color: '#0f172a', margin: 0 }}>{nm}</p><p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{role}</p></div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{fmt$(amt)}</span>
            </div>
          ))}
        </Panel>
        <Button variant="primary" full onClick={() => onDone(`✅ Payroll sent — ${fmt$(total)} to ${team.length} people`)}>Run payroll · {fmt$(total)}</Button>
      </div>
    </div>
  );
}

const cardBtn3 = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '18px 0', borderRadius: 20, border: '1px solid #f1f5f9', background: '#fff', boxShadow: '0 1px 2px rgba(15,23,42,.04)', cursor: 'pointer', minHeight: 90 };

Object.assign(window, { HistoryScreen, NotificationsScreen, ProfileScreen, CardScreen, CreditScreen, MerchantScreen, ChamaScreen, PayrollScreen });
