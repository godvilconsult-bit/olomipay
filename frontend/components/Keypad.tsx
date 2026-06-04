'use client';

/**
 * Keypad — the in-app numeric keypad from the OlomiPay UI kit (dark skin).
 * Used on Sign in + Create account so PIN entry never needs the OS keyboard.
 *
 * Props:
 *   onDigit(d)   — called with '0'..'9' when a number is pressed
 *   onBackspace  — called when ⌫ is pressed
 */
export default function Keypad({
  onDigit, onBackspace,
}: {
  onDigit:     (d: string) => void;
  onBackspace: () => void;
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
      {keys.map((k, i) => (
        <button
          key={i}
          type="button"
          disabled={!k}
          onClick={() => (k === '⌫' ? onBackspace() : k && onDigit(k))}
          style={{
            padding: '14px 0', borderRadius: 14,
            border: '1px solid rgba(255,255,255,.08)',
            background: k ? 'rgba(255,255,255,.04)' : 'transparent',
            color: '#fff', fontSize: 19, fontWeight: 600,
            cursor: k ? 'pointer' : 'default',
            transition: 'transform .1s, background .1s',
          }}
          onPointerDown={e => { if (k) (e.currentTarget.style.transform = 'scale(0.94)'); }}
          onPointerUp={e => { e.currentTarget.style.transform = 'none'; }}
          onPointerLeave={e => { e.currentTarget.style.transform = 'none'; }}
        >
          {k}
        </button>
      ))}
    </div>
  );
}
