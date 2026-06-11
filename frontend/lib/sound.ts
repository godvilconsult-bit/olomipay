'use client';

// Short attention chime (Web Audio — no asset needed) + vibration.
// Used to alert a rider the instant a supplier sends them a job.
let ctx: AudioContext | null = null;

export function playAlert() {
  if (typeof window === 'undefined') return;
  try {
    ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    const tones: [number, number][] = [[880, t0], [1320, t0 + 0.16], [1760, t0 + 0.32]];
    for (const [freq, at] of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(at); osc.stop(at + 0.22);
    }
  } catch { /* audio blocked until a user gesture — ignore */ }
  try { navigator.vibrate?.([300, 120, 300]); } catch {}
}

/** Prime the audio context from a user gesture (e.g. when the rider goes online). */
export function primeAudio() {
  if (typeof window === 'undefined') return;
  try {
    ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {}
}
