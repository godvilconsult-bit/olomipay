/* OlomiPay UI Kit — grow your money: Savings, Stake, Bonds, Rewards, Chama. */

/* ── SAVINGS (4.5% APY vault) ───────────────────────────────────────────── */
function SavingsScreen({ onBack, onDone }) {
  const [tab, setTab] = React.useState('overview');
  const [step, setStep] = React.useState('amount');
  const [amount, setAmount] = React.useState('');
  const [pin, setPin] = React.useState('');
  const principal = 320.00, yieldEarned = 4.82;
  const a = parseFloat(amount || '0');
  React.useEffect(() => { if (pin.length === 6) { const t = setTimeout(() => setStep('success'), 250); return () => clearTimeout(t); } }, [pin]);
  const reset = () => { setStep('amount'); setAmount(''); setPin(''); };

  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title="Savings" onBack={onBack} right={<Pill>4.5% APY</Pill>} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 22, color: '#fff', background: 'linear-gradient(to bottom right,#16a34a,#047857)' }}>
          <div style={{ position: 'absolute', top: -32, right: -32, width: 128, height: 128, background: 'rgba(255,255,255,.06)', borderRadius: '50%' }} />
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', margin: '0 0 4px' }}>Savings Balance</p>
          <p style={{ fontSize: 36, fontWeight: 700, margin: 0 }}>{fmt$(principal)}</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', margin: '4px 0 0' }}>+ {fmt$(yieldEarned)} yield earned 🌱</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 14 }}><Icon name="trending" size={13} /> Projected this month: {fmt$(principal * 0.045 / 12)}</div>
        </div>
        <Segmented value={tab} onChange={v => { setTab(v); reset(); }} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'deposit', label: 'Deposit' }, { value: 'withdraw', label: 'Withdraw' }]} />

        {tab === 'overview' && <>
          <Panel><h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: '#0f172a' }}>How it works</h3>
            {[['🌱', 'Deposit USDC into your savings vault'], ['📈', 'Earn 4.5% APY — accrues every second'], ['💸', 'Withdraw anytime (best after 30 days)'], ['🔒', 'Secured by a Soroban smart contract on Stellar']].map(([e, t]) => (
              <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}><span style={{ fontSize: 18 }}>{e}</span><span style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.4 }}>{t}</span></div>
            ))}
          </Panel>
          <Panel><h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: '#0f172a' }}>Yield calculator</h3>
            <Field label="If I save (USDC)" value={amount} onChange={setAmount} placeholder="100" />
            {a > 0 && <div style={{ background: '#f0fdf4', borderRadius: 16, padding: 14, marginTop: 12 }}>
              {[['1 month', a * 0.045 / 12], ['3 months', a * 0.045 / 4], ['1 year', a * 0.045]].map(([p, y]) => <Row key={p} k={p} v={`+ ${fmt$(y)}`} c="#16a34a" />)}
            </div>}
          </Panel>
        </>}

        {(tab === 'deposit' || tab === 'withdraw') && step === 'amount' && <>
          {tab === 'withdraw' && <Panel style={{ background: 'rgba(217,119,6,.07)', border: '1px solid #fde68a' }}><p style={{ fontSize: 13, fontWeight: 600, color: '#b45309', margin: 0 }}>⚠️ Early withdrawal — deposited 12 days ago</p><p style={{ fontSize: 12, color: 'rgba(180,83,9,.8)', margin: '4px 0 0' }}>For best returns, keep savings for 30+ days.</p></Panel>}
          <Panel>
            <Field label={`${tab === 'deposit' ? 'Deposit' : 'Withdraw'} amount (USDC)`} value={amount} onChange={setAmount} placeholder="0.00" big autoFocus />
            {tab === 'deposit' && a > 0 && <p style={{ fontSize: 12, color: '#16a34a', margin: '10px 0 0' }}>You'll earn ~{fmt$(a * 0.045 / 12)} USDC per month</p>}
            {tab === 'withdraw' && <p style={{ fontSize: 12, color: '#94a3b8', margin: '10px 0 0' }}>Available: {fmt$(principal + yieldEarned)}</p>}
          </Panel>
          <Button variant="primary" full disabled={a <= 0} onClick={() => setStep('pin')}>Continue</Button>
        </>}
        {(tab === 'deposit' || tab === 'withdraw') && step === 'pin' && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginTop: 8 }}>
          <ConfirmCard label={tab === 'deposit' ? 'Depositing into savings' : 'Withdrawing from savings'} value={fmt$(a)} />
          <PinEntry value={pin} onChange={setPin} accent="#16a34a" />
        </div>}
        {step === 'success' && <SuccessInline title={tab === 'deposit' ? 'Deposited! 🌱' : 'Withdrawn!'} body={tab === 'deposit' ? 'Your savings are growing.' : 'Funds sent to your wallet.'} onCta={() => { setTab('overview'); reset(); onDone(tab === 'deposit' ? '🌱 Added to savings' : '✅ Withdrawn from savings'); }} />}
      </div>
    </div>
  );
}

/* ── STAKE (locked USDC pools) ──────────────────────────────────────────── */
const POOLS = [
  { days: 30, label: 'Flexible', badge: 'Popular', apy: '6%', color: '#3b82f6', apyN: 0.06 },
  { days: 90, label: 'Standard', badge: 'Best value', apy: '9%', color: '#8b5cf6', apyN: 0.09 },
  { days: 180, label: 'Premium', badge: 'Max yield', apy: '12%', color: '#f59e0b', apyN: 0.12 },
];
function StakeScreen({ onBack, onDone }) {
  const [step, setStep] = React.useState('select');
  const [sel, setSel] = React.useState(null);
  const [amount, setAmount] = React.useState('');
  const [pin, setPin] = React.useState('');
  const a = parseFloat(amount || '0');
  React.useEffect(() => { if (pin.length === 6) { const t = setTimeout(() => setStep('success'), 250); return () => clearTimeout(t); } }, [pin]);

  if (step === 'success') return <SuccessState emoji="🔒" accent="#f59e0b" title={`Staked! Earning ${sel.apy} APY`} body={`Your ${fmt$(a)} USDC is locked for ${sel.days} days. Yield accrues every second.`} ctaLabel="View position" onCta={() => { setStep('select'); setAmount(''); setSel(null); setPin(''); onDone(`🔒 Staked ${fmt$(a)}`); }} />;

  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title="USDC Staking" onBack={step === 'select' ? onBack : () => setStep('select')} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {step === 'select' && <>
          {/* active position */}
          <div style={{ borderRadius: 24, padding: 20, color: '#fff', background: 'linear-gradient(to bottom right,#f59e0b,#ea580c)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><Icon name="lock" size={15} /><span style={{ fontSize: 13, fontWeight: 500 }}>Active Stake — 9% APY</span><span style={{ marginLeft: 'auto', fontSize: 11, background: 'rgba(255,255,255,.2)', padding: '2px 8px', borderRadius: 999 }}>62 days left</span></div>
            <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{fmt$(150)}</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', margin: '4px 0 0' }}>+ {fmt$(2.21)} earned</p>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Choose a lock period to start earning:</p>
          {POOLS.map(p => (
            <button key={p.days} onClick={() => { setSel(p); setStep('amount'); }} style={{ ...cardBtn2, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="trending" size={22} style={{ color: '#fff' }} /></div>
                <div style={{ flex: 1 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{p.label}</span><Pill bg="#f1f5f9" fg="#64748b">{p.badge}</Pill></div><div style={{ fontSize: 13, color: '#94a3b8' }}>{p.days}-day lock period</div></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{p.apy}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>APY</div></div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12, marginTop: 12 }}>
                {[100, 500, 1000].map(amt => <Row key={amt} k={`Stake $${amt}`} v={`+ ${fmt$(amt * p.apyN * p.days / 365)}`} c="#16a34a" />)}
              </div>
            </button>
          ))}
        </>}
        {step === 'amount' && sel && <>
          <div style={{ borderRadius: 20, padding: 20, color: '#fff', background: 'linear-gradient(to bottom right,#1e293b,#0f172a)' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', margin: '0 0 2px' }}>{sel.label} Lock</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: '#fbbf24', margin: 0 }}>{sel.apy} APY</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '4px 0 0' }}>Early exit: 1% penalty</p>
          </div>
          <Panel><Field label="Stake amount (USDC)" value={amount} onChange={setAmount} placeholder="0.00" big autoFocus />{a > 0 && <p style={{ fontSize: 12, color: '#16a34a', margin: '10px 0 0' }}>You'll earn ~{fmt$(a * sel.apyN * sel.days / 365)} USDC</p>}</Panel>
          <Button variant="primary" full disabled={a <= 0} onClick={() => setStep('pin')}>Continue</Button>
        </>}
        {step === 'pin' && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginTop: 8 }}>
          <ConfirmCard label={`Staking ${sel.days} days at ${sel.apy}`} value={fmt$(a)} />
          <PinEntry value={pin} onChange={setPin} accent="#f59e0b" />
        </div>}
      </div>
    </div>
  );
}

/* ── BONDS / INVEST ─────────────────────────────────────────────────────── */
const BONDS = [
  { id: 't1', name: 'TZ Govt Treasury Bill — 91 day', apy: '11.4%', apyN: 0.114, min: 50, days: 91, investors: 1240, funded: 0.72 },
  { id: 't2', name: 'TZ Infrastructure Bond — 2yr', apy: '13.8%', apyN: 0.138, min: 100, days: 730, investors: 612, funded: 0.41 },
];
function InvestScreen({ onBack, onDone }) {
  const [step, setStep] = React.useState('list');
  const [sel, setSel] = React.useState(null);
  const [amount, setAmount] = React.useState('');
  const [pin, setPin] = React.useState('');
  const a = parseFloat(amount || '0');
  React.useEffect(() => { if (pin.length === 6) { const t = setTimeout(() => setStep('success'), 250); return () => clearTimeout(t); } }, [pin]);

  if (step === 'success') return <SuccessState emoji="📈" accent="#1a56db" title="Investment confirmed!" body={`${fmt$(a)} USDC invested in ${sel.name}`} ctaLabel="View portfolio" onCta={() => { setStep('list'); setAmount(''); setSel(null); setPin(''); onDone('📈 Investment confirmed'); }} extra={<p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Projected annual return: {fmt$(a * sel.apyN)} USDC</p>} />;

  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title="Bonds & Investment" onBack={step === 'list' ? onBack : () => setStep('list')} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {step === 'list' && <>
          <div style={{ borderRadius: 24, padding: 20, color: '#fff', background: 'linear-gradient(to bottom right,#2563eb,#4338ca)' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', margin: '0 0 2px' }}>My Portfolio</p>
            <p style={{ fontSize: 30, fontWeight: 700, margin: 0 }}>{fmt$(250)}</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', margin: '4px 0 0' }}>+ {fmt$(11.40)} accrued interest</p>
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#64748b', margin: 0 }}>Available bonds</p>
          {BONDS.map(b => (
            <Panel key={b.id}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🏦</div>
                <div style={{ flex: 1 }}><p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0, lineHeight: 1.2 }}>{b.name}</p></div>
                <div style={{ textAlign: 'right' }}><p style={{ fontSize: 19, fontWeight: 700, color: '#16a34a', margin: 0 }}>{b.apy}</p><p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>APY</p></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, margin: '12px 0' }}>
                {[['Min', fmt$(b.min)], ['Matures', `${b.days}d`], ['Investors', b.investors.toLocaleString()]].map(([l, v]) => <div key={l} style={{ background: '#f8fafc', borderRadius: 12, padding: 8, textAlign: 'center' }}><p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{l}</p><p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0 }}>{v}</p></div>)}
              </div>
              <div style={{ marginBottom: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}><span>Funded {Math.round(b.funded * 100)}%</span></div><div style={{ height: 6, background: '#f1f5f9', borderRadius: 999 }}><div style={{ height: '100%', width: `${b.funded * 100}%`, background: '#16a34a', borderRadius: 999 }} /></div></div>
              <Button variant="primary" full onClick={() => { setSel(b); setStep('amount'); }}>Invest now</Button>
            </Panel>
          ))}
        </>}
        {step === 'amount' && sel && <>
          <div style={{ borderRadius: 20, padding: 20, color: '#fff', background: 'linear-gradient(to bottom right,#2563eb,#4338ca)' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', margin: 0 }}>{sel.name}</p>
            <p style={{ fontSize: 24, fontWeight: 700, color: '#fcd34d', margin: '2px 0 0' }}>{sel.apy} APY</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', margin: '4px 0 0' }}>Matures in {sel.days} days</p>
          </div>
          <Panel><Field label="Investment amount (USDC)" value={amount} onChange={setAmount} placeholder={`Min ${sel.min}`} big autoFocus />
            {a >= sel.min && <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 12, marginTop: 12 }}><Row k="Annual return" v={`+ ${fmt$(a * sel.apyN)}`} c="#16a34a" bold /><Row k={`At maturity (${sel.days}d)`} v={`+ ${fmt$(a * sel.apyN * sel.days / 365)}`} c="#16a34a" /></div>}
          </Panel>
          <Button variant="primary" full disabled={a < sel.min} onClick={() => setStep('pin')}>Continue</Button>
        </>}
        {step === 'pin' && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginTop: 8 }}>
          <ConfirmCard label={`Investing in ${sel.name}`} value={fmt$(a)} />
          <PinEntry value={pin} onChange={setPin} />
        </div>}
      </div>
    </div>
  );
}

/* ── REWARDS ────────────────────────────────────────────────────────────── */
function RewardsScreen({ onBack, onDone }) {
  const tier = 'SILVER', balance = 2480, progress = 62;
  const catalog = [
    { id: 'fee_waiver', emoji: '🎫', label: 'Fee-free week', desc: '7 days no fees', points: 1000 },
    { id: 'airtime', emoji: '📱', label: 'TZS 5,000 airtime', desc: 'Any network', points: 2000 },
    { id: 'cash', emoji: '💵', label: '$2 cash bonus', desc: 'To your wallet', points: 4000 },
    { id: 'cash2', emoji: '💵', label: '$5 cash bonus', desc: 'To your wallet', points: 9000 },
  ];
  return (
    <div className="olo-scroll" style={{ height: '100%', overflowY: 'auto', paddingBottom: 96, background: '#f8fafc' }}>
      <ScreenHeader title="Rewards" onBack={onBack} />
      <div style={{ maxWidth: 448, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 22, color: '#fff', background: 'linear-gradient(to bottom right,#94a3b8,#cbd5e1)' }}>
          <div style={{ position: 'absolute', top: -32, right: -32, width: 128, height: 128, background: 'rgba(255,255,255,.15)', borderRadius: '50%' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="star" size={15} /><span style={{ fontSize: 13, fontWeight: 600 }}>{tier}</span></div>
              <span style={{ fontSize: 11, background: 'rgba(255,255,255,.25)', padding: '2px 8px', borderRadius: 999 }}>{progress}% to GOLD</span>
            </div>
            <p style={{ fontSize: 34, fontWeight: 800, margin: 0 }}>{balance.toLocaleString()}</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', margin: 0 }}>points</p>
            <div style={{ height: 6, background: 'rgba(255,255,255,.3)', borderRadius: 999, marginTop: 12 }}><div style={{ height: '100%', width: `${progress}%`, background: '#fff', borderRadius: 999 }} /></div>
          </div>
        </div>
        <Panel><h3 style={{ fontSize: 13, fontWeight: 600, color: '#64748b', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="zap" size={14} style={{ color: '#f59e0b' }} /> How to earn points</h3>
          {[['Send money', '1 pt / 1,000 TZS'], ['Pay a bill', '5 points'], ['Refer a friend', '500 points'], ['First stake', '200 points'], ['30-day streak', '100 bonus']].map(([k, v]) => <Row key={k} k={k} v={v} c="#d97706" />)}
        </Panel>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: '#64748b', margin: '0 0 -4px' }}>Redeem rewards</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {catalog.map(it => { const can = balance >= it.points; return (
            <button key={it.id} onClick={() => can && onDone(`🎁 Redeemed: ${it.label}`)} disabled={!can} style={{ ...cardBtn2, textAlign: 'left', opacity: can ? 1 : 0.5, cursor: can ? 'pointer' : 'default' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{it.emoji}</div>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a', margin: 0, lineHeight: 1.2 }}>{it.label}</p>
              <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '2px 0 8px' }}>{it.desc}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#d97706', margin: 0 }}>{it.points.toLocaleString()} pts</p>
            </button>
          ); })}
        </div>
        <Panel><h3 style={{ fontSize: 13, fontWeight: 600, color: '#64748b', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="share" size={13} style={{ color: '#1a56db' }} /> Refer friends</h3>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 12px' }}>Earn 500 points for every friend who registers and completes KYC.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', borderRadius: 12, padding: '10px 12px' }}>
            <span style={{ flex: 1, fontFamily: 'ui-monospace,monospace', fontSize: 12, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>olomipay.app/r/AMINA7K2</span>
            <button onClick={() => onDone('Referral link copied!')} style={{ border: 0, background: 'rgba(26,86,219,.1)', color: '#1a56db', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}><Icon name="copy" size={14} /></button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SuccessInline({ title, body, onCta }) {
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 24, textAlign: 'center' }}>
    <div style={{ width: 72, height: 72, borderRadius: 999, background: 'rgba(22,163,74,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}><Icon name="checkcircle" size={36} /></div>
    <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#0f172a' }}>{title}</h2>
    <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>{body}</p>
    <Button variant="primary" full onClick={onCta}>Done</Button>
  </div>;
}
const cardBtn2 = { background: '#fff', borderRadius: 20, padding: 16, border: '1px solid #f1f5f9', boxShadow: '0 1px 2px rgba(15,23,42,.04)', cursor: 'pointer', width: '100%' };

Object.assign(window, { SavingsScreen, StakeScreen, InvestScreen, RewardsScreen });
