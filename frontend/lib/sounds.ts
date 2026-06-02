/**
 * Shared notification sound engine (Web Audio API — no audio files, works on
 * mobile after the first user interaction). Used app-wide by ChatNotifier and the
 * chat thread so every notification sounds consistent and delightful.
 */

let _ctx: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    _ctx = _ctx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  } catch { return null; }
}

type Wave = OscillatorType;

/** Play a single note with a soft attack + exponential decay (bell-like). */
function note(c: AudioContext, freq: number, start: number, dur: number, opts: {
  type?: Wave; gain?: number; detune?: number;
} = {}) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.value = freq;
  if (opts.detune) o.detune.value = opts.detune;
  const t0 = c.currentTime + start;
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);          // quick soft attack
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);          // smooth tail
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

// Note frequencies (equal temperament)
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568;

export const sounds = {
  /**
   * 💰 Money received — a bright, celebratory "cha-ching" + sparkle.
   * Layered: a quick metallic coin ding, a rising C-major arpeggio with warm
   * triangle+sine layers, then a high shimmer that twinkles away.
   */
  moneyIn(): void {
    const c = ctx(); if (!c) return;
    // 1) coin "ti-ting" — two bright, close high notes
    note(c, 2200, 0,    0.10, { type: 'square',   gain: 0.10 });
    note(c, 2800, 0.05, 0.12, { type: 'square',   gain: 0.08 });
    // 2) rising major arpeggio (warm bell: triangle + sine an octave layer)
    const arp: [number, number][] = [[C5, 0.10], [E5, 0.20], [G5, 0.30], [C6, 0.42]];
    arp.forEach(([f, s]) => {
      note(c, f,     s, 0.30, { type: 'triangle', gain: 0.34 });
      note(c, f * 2, s, 0.22, { type: 'sine',     gain: 0.10 }); // shimmer octave
    });
    // 3) final sparkle twinkle
    note(c, E6, 0.52, 0.45, { type: 'sine', gain: 0.22 });
    note(c, G6, 0.60, 0.50, { type: 'sine', gain: 0.14 });
  },

  /** ✅ Money sent — short, satisfying confirm (two descending soft notes). */
  moneyOut(): void {
    const c = ctx(); if (!c) return;
    note(c, G5, 0,    0.14, { type: 'triangle', gain: 0.3 });
    note(c, C5, 0.11, 0.20, { type: 'triangle', gain: 0.3 });
  },

  /** 💛 Payment request — friendly attention ping (rising → resolve). */
  request(): void {
    const c = ctx(); if (!c) return;
    note(c, A5, 0,    0.10, { type: 'triangle', gain: 0.26 });
    note(c, C6, 0.10, 0.10, { type: 'triangle', gain: 0.26 });
    note(c, E6, 0.22, 0.18, { type: 'sine',     gain: 0.22 });
  },

  /** 💬 Incoming chat message — light, pleasant two-note chime. */
  message(): void {
    const c = ctx(); if (!c) return;
    note(c, E6, 0,    0.10, { type: 'sine', gain: 0.22 });
    note(c, A5, 0.10, 0.16, { type: 'sine', gain: 0.20 });
  },
};

/** Map a notification type → sound. */
export function playNotificationSound(type: 'money' | 'message' | 'request' | 'sent') {
  if (type === 'money')        sounds.moneyIn();
  else if (type === 'request') sounds.request();
  else if (type === 'sent')    sounds.moneyOut();
  else                         sounds.message();
}
