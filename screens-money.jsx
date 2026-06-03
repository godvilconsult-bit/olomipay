/* OlomiPay UI Kit — money movement: Deposit, Withdraw, Swap, Bills. */

const RATE = 2600;

/* ── DEPOSIT (Add Money) ────────────────────────────────────────────────── */
const MOMO = [
  { id: 'mpesa',  name: 'M-Pesa',       flag: '🇹🇿', color: '#00A651', countries: 'Kenya, Tanzania' },
  { id: 'airtel', name: 'Airtel Money', flag: '🔴', color: '#FF0000', countries: 'Uganda, Zambia, Rwanda' },
  { id: 'mtn',    name: 'MTN MoMo',     flag: '🟡', color: '#FFC107', countries: 'Ghana, Uganda, South Africa' },
  { id: 'tigo',   name: 'Tigo Pesa',    flag: '🔵', color: '#00AEEF', countries: 'Tanzania, Ghana' },
  { id: 'halo',   name: 'HaloPesa',     flag: '🟣', color: '#7c3aed', countries: 'Tanzania' },
];
function DepositScreen({ onBack, onDone, onReceive }) {
  const [tab, setTab] = React.useState('mobile');
  const [step, setStep] = React.useState('method');
  const [method, setMethod] = React.useState(null);
  const [amount, setAmount] = React.useState('');
  const n = parseInt(amount || '0', 10);
  const usdc = n / RATE, fee = usdc * 0.01, net = usdc - fee;

  if (step === 'waiting') return (
    <SuccessState emoji="📲" accent="#1a56db" title="Check your phone"
      body={`A payment prompt was sent to your ${method?.name} number. Approve it to complete your deposit.`}
      ctaLabel="I've approved the payment →" onCta={() => setStep('success')}
      extra={<Panel style={{ width: '100%', background: 'rgba(217,119,6,.07)', border: '1px solid #fde68a', textAlign: 'left' }}>
        <Row k="You pay" v={`TZS ${n.toLocaleString()}`} />
        <Row k="OlomiPay fee (1%)" v={`− ${fmt$(fee)}`} c="#d97706" />
        <div style={{ borderTop: '1px solid #fde68a', marginTop: 8, paddingTop: 8 }}><Row k="You receive" v={`${fmt$(net)} USD`} c="#16a34a" bold /></div>
      </Panel>} />
  );
  if (step === 'success') return (
    <SuccessState emoji="✅" title="Deposit in progress!"
      body={`Once ${method?.name} confirms, ${fmt$(net)} USD will appear in your Olomi Wallet.`}
      ctaLabel="Back to home" onCta={() => onDone(`✅ Deposit of ${fmt$(net)} confirming…`)} />
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>
      <ScreenHeader title="Add Money" onBack={onBack} />
      <Segmented variant="underline" value={tab} onChange={v => { setTab(v); setStep('method'); }}
        tabs={[{ value: 'receive', label: '📥 Receive' }, { value: 'mobile', label: '📱 Mobile Money' }, { value: 'bank', label: '🏦 Bank' }]} />
      <div className="olo-scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 32 }}>
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {tab === 'mobile' && step === 'method' && <>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Choose your mobile money provider to deposit.</p>
          {MOMO.map(p => (
            <button key={p.id} onClick={() => { setMethod(p); setStep('amount'); }} style={rowBtn}>
              <div style={{ width: 48, height: 48, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: p.color + '22', flexShrink: 0 }}>{p.flag}</div>
              <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{p.name}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{p.countries}</div></div>
              <Icon name="arrowright" size={16} style={{ color: '#cbd5e1' }} />
            </button>
          ))}
        </>}

        {tab === 'mobile' && step === 'amount' && <>
          <button onClick={() => setStep('method')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', border: 0, background: 'none', cursor: 'pointer', padding: 0 }}><Icon name="arrowleft" size={15} /> {method?.name}</button>
          <Panel>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>Amount</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '2px solid #1a56db', borderRadius: 16, padding: '0 14px', marginTop: 8 }}>
              <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>TZS</span>
              <input value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="0" inputMode="numeric" autoFocus
                style={{ flex: 1, border: 0, outline: 0, fontSize: 28, fontWeight: 700, textAlign: 'right', padding: '12px 0', background: 'transparent', color: '#0f172a' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 12 }}>
              {[5000, 10000, 20000, 50000, 100000, 500000].map(p => (
                <button key={p} onClick={() => setAmount(String(p))} style={{ padding: '9px 0', borderRadius: 12, border: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: n === p ? '#1a56db' : '#f1f5f9', color: n === p ? '#fff' : '#475569' }}>{p >= 1000 ? `${p / 1000}K` : p}</button>
              ))}
            </div>
          </Panel>
          {n >= 500 && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', background: '#fff' }}>
              <div style={{ background: '#f8fafc', padding: '8px 14px', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em' }}>Fee breakdown</div>
              <div style={{ padding: '12px 14px' }}>
                <Row k="You pay (M-Pesa)" v={`TZS ${n.toLocaleString()}`} />
                <Row k="Rate" v={`1 USD ≈ TZS ${RATE.toLocaleString()}`} c="#64748b" />
                <Row k="OlomiPay fee (1%)" v={`− ${fmt$(fee)}`} c="#d97706" />
                <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 8, paddingTop: 8 }}><Row k="You receive" v={`${fmt$(net)} USDC`} c="#16a34a" bold /></div>
              </div>
            </div>
          )}
          <Button variant="primary" full disabled={n < 500} onClick={() => setStep('waiting')}>
            {n >= 500 ? `Deposit ${n.toLocaleString()} via ${method?.name}` : 'Enter amount (min 500)'}
          </Button>
        </>}

        {tab === 'receive' && (
          <Panel style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 22 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0, textAlign: 'center' }}>Scan to send USDC or coins on Stellar</p>
            <div style={{ width: 200, height: 200, borderRadius: 18, background: '#0f172a', display: 'grid', gridTemplateColumns: 'repeat(11,1fr)', gridTemplateRows: 'repeat(11,1fr)', padding: 14, gap: 2 }}>
              {Array.from({ length: 121 }).map((_, i) => { const seed = (i * 53 + 7) % 11; return <div key={i} style={{ background: (seed < 5 || i % 7 === 0 || i % 5 === 0) ? '#fff' : 'transparent', borderRadius: 1 }} />; })}
            </div>
            <Pill bg="rgba(217,119,6,.12)" fg="#b45309">⚠ TESTNET — not real money</Pill>
            <div style={{ width: '100%', background: '#f8fafc', borderRadius: 16, padding: 12 }}>
              <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', margin: '0 0 4px' }}>Your wallet address</p>
              <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, textAlign: 'center', color: '#475569', margin: 0, wordBreak: 'break-all' }}>GABC4XYZ…7K2MNQWERTYUIOPLKJHGFDSAZXCVB…WXYZ</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, width: '100%' }}>
              {[['copy', 'Copy', 'rgba(26,86,219,.1)', '#1a56db'], ['share', 'Share', '#eff6ff', '#2563eb'], ['qr', 'Explorer', '#f1f5f9', '#64748b']].map(([ic, lb, bg, fg]) => (
                <button key={lb} onClick={() => onDone('Address copied!')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 0', borderRadius: 16, border: 0, cursor: 'pointer', background: bg, color: fg }}><Icon name={ic} size={18} /><span style={{ fontSize: 12, fontWeight: 600 }}>{lb}</span></button>
              ))}
            </div>
          </Panel>
        )}

        {tab === 'bank' && <>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Bank transfer deposit — coming soon.</p>
          {[['Tanzania Banks', 'CRDB, NMB, NBC, Equity, DTB'], ['Kenya Banks', 'KCB, Equity, Cooperative, NCBA'], ['International Transfer', 'SWIFT / SEPA / Wire']].map(([nm, d]) => (
            <div key={nm} style={{ ...rowBtn, opacity: 0.6, cursor: 'default' }}>
              <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(26,86,219,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🏦</div>
              <div style={{ flex: 1, textAlign: 'left' }}><div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{nm}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{d}</div></div>
              <Pill bg="#f1f5f9" fg="#94a3b8">Soon</Pill>
            </div>
          ))}
        </>}
      </div>
      </div>
    </div>
  );
}

/* ── WITHDRAW (Cash Out) ────────────────────────────────────────────────── */
function WithdrawScreen({ onBack, onDone, balance }) {
  const [step, setStep] = React.useState('amount');
  const [amount, setAmount] = React.useState('');
  const [pin, setPin] = React.useState('');
  const usdc = parseFloat(amount || '0'), tzs = usdc * RATE;
  const valid = usdc > 0 && usdc <= balance;
  React.useEffect(() => { if (pin.length === 6) { const t = setTimeout(() => setStep('success'), 250); return () => clearTimeout(t); } }, [pin]);

  if (step === 'success') return <SuccessState icon="checkcircle" title="Withdrawal initiated!" body={`${fmtTZS(tzs)} will arrive on your Mobile Money shortly.`} onCta={() => onDone(`✅ Withdrawing ${fmtTZS(tzs)} to M-Pesa`)} />;

  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title={step === 'pin' ? 'Confirm withdrawal' : 'Cash Out'} onBack={step === 'pin' ? () => { setStep('amount'); setPin(''); } : onBack} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '20px 16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {step === 'amount' && <>
          <ConfirmCard label="Available balance" value={fmt$(balance)} />
          <Panel>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>Withdraw (USDC)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #e2e8f0', borderRadius: 16, padding: '0 14px', marginTop: 8 }}>
              <span style={{ fontSize: 18, color: '#94a3b8', fontWeight: 500 }}>$</span>
              <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" autoFocus style={{ flex: 1, border: 0, outline: 0, fontSize: 24, fontWeight: 700, padding: '12px 0', background: 'transparent', color: '#0f172a' }} />
              <button onClick={() => setAmount(String(balance))} style={{ fontSize: 12, color: '#1a56db', fontWeight: 700, border: 0, background: 'none', cursor: 'pointer' }}>MAX</button>
            </div>
          </Panel>
          {usdc > 0 && <Panel style={{ background: '#f8fafc' }}>
            <Row k="USDC deducted" v={`− ${fmt$(usdc)}`} c="#dc2626" />
            <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 8, paddingTop: 8 }}><Row k="You receive" v={fmtTZS(tzs)} c="#16a34a" bold /></div>
          </Panel>}
          <Button variant="primary" full disabled={!valid} onClick={() => setStep('pin')}>Continue</Button>
        </>}
        {step === 'pin' && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginTop: 8 }}>
          <ConfirmCard label="Withdrawing" value={fmt$(usdc)} sub={`≈ ${fmtTZS(tzs)} to your mobile money`} />
          <PinEntry value={pin} onChange={setPin} />
        </div>}
      </div>
    </div>
  );
}

/* ── SWAP ───────────────────────────────────────────────────────────────── */
function SwapScreen({ onBack, onDone }) {
  const [from, setFrom] = React.useState('XLM');
  const [to, setTo] = React.useState('USDC');
  const [amount, setAmount] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [step, setStep] = React.useState('form');
  const rate = from === 'XLM' ? 0.1143 : 8.75;
  const a = parseFloat(amount || '0'), youGet = a * rate, fee = youGet * 0.003;
  React.useEffect(() => { if (pin.length === 6) { const t = setTimeout(() => setStep('success'), 250); return () => clearTimeout(t); } }, [pin]);
  const flip = () => { setFrom(to); setTo(from); };

  if (step === 'success') return <SuccessState title="Swap complete!" body={`${amount} ${from} → ${youGet.toFixed(4)} ${to}`} ctaLabel="Swap again" onCta={() => { setStep('form'); setAmount(''); setPin(''); onDone('✅ Swap settled on-chain'); }} extra={<p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, color: '#94a3b8', wordBreak: 'break-all', margin: 0 }}>a3f9…c7e2 · settled 0.9s</p>} />;

  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title="Currency Swap" onBack={step === 'pin' ? () => { setStep('form'); setPin(''); } : onBack} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {step === 'form' && <>
          <Panel>
            <label style={{ fontSize: 12, color: '#94a3b8' }}>You send</label>
            <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
              <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" autoFocus style={{ flex: 1, border: 0, outline: 0, fontSize: 26, fontWeight: 700, background: 'transparent', color: '#0f172a', minWidth: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1a56db', background: '#eff6ff', padding: '8px 14px', borderRadius: 12 }}>{from}</span>
            </div>
          </Panel>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '-6px 0' }}>
            <button onClick={flip} style={{ width: 40, height: 40, borderRadius: 999, border: '1px solid #f1f5f9', background: '#fff', boxShadow: '0 2px 8px rgba(15,23,42,.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a56db' }}><Icon name="swap" size={18} /></button>
          </div>
          <Panel>
            <label style={{ fontSize: 12, color: '#94a3b8' }}>You receive</label>
            <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, fontSize: 26, fontWeight: 700, color: '#16a34a' }}>{a > 0 ? youGet.toFixed(4) : '—'}</div>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', padding: '8px 14px', borderRadius: 12 }}>{to}</span>
            </div>
          </Panel>
          {a > 0 && <Panel style={{ background: '#f8fafc' }}>
            <Row k="Rate" v={`1 ${from} = ${rate} ${to}`} c="#64748b" />
            <Row k="Platform fee (0.3%)" v={`${fee.toFixed(4)} ${to}`} c="#64748b" />
            <Row k="Max slippage" v="0.5%" c="#64748b" />
          </Panel>}
          <Button variant="primary" full disabled={a <= 0} onClick={() => setStep('pin')}>Swap {from} → {to}</Button>
        </>}
        {step === 'pin' && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginTop: 8 }}>
          <ConfirmCard label="Swapping" value={`${amount} ${from}`} sub={`→ ~${youGet.toFixed(4)} ${to}`} />
          <PinEntry value={pin} onChange={setPin} />
        </div>}
      </div>
    </div>
  );
}

/* ── BILLS ──────────────────────────────────────────────────────────────── */
const BILLERS = [
  { id: 'tanesco', name: 'TANESCO LUKU', category: 'Electricity', logo: '💡', bg: '#fef9c3', fg: '#ca8a04', min: 1000 },
  { id: 'dawasa',  name: 'DAWASA Water', category: 'Water', logo: '💧', bg: '#dbeafe', fg: '#2563eb', min: 2000 },
  { id: 'dstv',    name: 'DStv', category: 'TV', logo: '📺', bg: '#f3e8ff', fg: '#9333ea', min: 5000 },
  { id: 'airtime', name: 'Airtime Top-up', category: 'Airtime', logo: '📱', bg: '#dcfce7', fg: '#16a34a', min: 500 },
  { id: 'startimes', name: 'StarTimes', category: 'TV', logo: '📡', bg: '#f3e8ff', fg: '#9333ea', min: 5000 },
  { id: 'gepg',    name: 'Govt (GePG)', category: 'Education', logo: '🎓', bg: '#ffe4e6', fg: '#e11d48', min: 10000 },
];
function BillsScreen({ onBack, onDone }) {
  const [step, setStep] = React.useState('select');
  const [biller, setBiller] = React.useState(null);
  const [acct, setAcct] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [search, setSearch] = React.useState('');
  const list = BILLERS.filter(b => (b.name + b.category).toLowerCase().includes(search.toLowerCase()));
  React.useEffect(() => { if (pin.length === 6) { const t = setTimeout(() => setStep('success'), 250); return () => clearTimeout(t); } }, [pin]);

  if (step === 'success') return <SuccessState emoji="✅" title={`${biller?.name} paid!`} body={`Reference OLP${Math.floor(Math.random() * 9e5 + 1e5)}`} ctaLabel="Pay another bill" onCta={() => { setStep('select'); setBiller(null); setAcct(''); setAmount(''); setPin(''); onDone('✅ Bill paid'); }}
    extra={biller?.id === 'tanesco' ? <Panel style={{ width: '100%', background: '#fef9c3', border: 'none' }}><p style={{ fontSize: 11, fontWeight: 600, color: '#ca8a04', margin: '0 0 4px' }}>LUKU TOKEN</p><p style={{ fontSize: 22, fontFamily: 'ui-monospace,monospace', fontWeight: 700, color: '#854d0e', letterSpacing: '.1em', margin: 0 }}>1834 5572 9011 6634</p></Panel> : null} />;

  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title={step === 'select' ? 'Pay Bills' : biller?.name} onBack={step === 'select' ? onBack : () => setStep('select')} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {step === 'select' && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: '0 14px' }}>
            <Icon name="search" size={16} style={{ color: '#94a3b8' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search billers…" style={{ flex: 1, border: 0, outline: 0, fontSize: 14, padding: '12px 0', background: 'transparent' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {list.map(b => (
              <button key={b.id} onClick={() => { setBiller(b); setStep('enter'); }} style={{ ...cardBtn, textAlign: 'left' }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, background: b.bg, marginBottom: 10 }}>{b.logo}</div>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a', margin: 0, lineHeight: 1.2 }}>{b.name}</p>
                <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '2px 0 0' }}>{b.category}</p>
              </button>
            ))}
          </div>
        </>}
        {step === 'enter' && <>
          <Panel>
            <div style={{ width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, background: biller.bg, marginBottom: 10 }}>{biller.logo}</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>{biller.name}</h2>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '2px 0 0' }}>{biller.category} · min TZS {biller.min.toLocaleString()}</p>
          </Panel>
          <Panel><Field label="Account / Meter number" value={acct} onChange={setAcct} placeholder="e.g. 12345678" autoFocus /></Panel>
          <Panel>
            <Field label="Amount (TZS)" value={amount} onChange={v => setAmount(v.replace(/\D/g, ''))} placeholder={`Min ${biller.min.toLocaleString()}`} big />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {[5000, 10000, 20000, 50000].map(p => <button key={p} onClick={() => setAmount(String(p))} style={{ padding: '7px 14px', borderRadius: 999, border: 0, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: +amount === p ? '#1a56db' : '#f1f5f9', color: +amount === p ? '#fff' : '#475569' }}>{p / 1000}K</button>)}
            </div>
          </Panel>
          <Button variant="primary" full disabled={!acct || !amount} onClick={() => setStep('pin')}>Continue</Button>
        </>}
        {step === 'pin' && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginTop: 8 }}>
          <ConfirmCard label={`Paying ${biller.name}`} value={fmtTZS(+amount)} sub={`Account ${acct}`} />
          <PinEntry value={pin} onChange={setPin} />
        </div>}
      </div>
    </div>
  );
}

/* shared bits */
function Row({ k, v, c = '#0f172a', bold }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: bold ? 15 : 13.5 }}>
    <span style={{ color: '#64748b', fontWeight: bold ? 700 : 400 }}>{k}</span><span style={{ color: c, fontWeight: bold ? 700 : 600 }}>{v}</span>
  </div>;
}
const rowBtn = { display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: 14, borderRadius: 18, border: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };
const cardBtn = { background: '#fff', borderRadius: 20, padding: 16, border: '1px solid #f1f5f9', boxShadow: '0 1px 2px rgba(15,23,42,.04)', cursor: 'pointer' };

Object.assign(window, { DepositScreen, WithdrawScreen, SwapScreen, BillsScreen, Row });
