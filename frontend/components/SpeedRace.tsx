'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

/**
 * Dramatizes the speed gap: when scrolled into view, OlomiPay lands at 0:03
 * almost instantly while the "transfer app" timer crawls toward 10:00.
 * Loops gently so it always feels alive. Pure CSS/JS, no deps.
 */
export default function SpeedRace() {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);

  // Start when in view
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setRun(true), { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="mb-4 grid grid-cols-2 gap-3">
      {/* Transfer apps — slow crawl */}
      <TheirTimer run={run} />
      {/* OlomiPay — instant */}
      <OurTimer run={run} />
    </div>
  );
}

function fmt(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function TheirTimer({ run }: { run: boolean }) {
  const [sec, setSec] = useState(0);
  const raf = useRef<number>();

  useEffect(() => {
    if (!run) return;
    let start: number | null = null;
    const LOOP = 7000;     // visualise the 10-min climb over 7s
    const TARGET = 600;    // 10:00
    const tick = (now: number) => {
      if (start === null) start = now;
      const p = ((now - start) % LOOP) / LOOP;       // 0..1 looping
      const eased = Math.pow(p, 0.7);                 // fast then slowing — feels stuck
      setSec(eased * TARGET);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [run]);

  const pct = (sec / 600) * 100;
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Transfer apps</p>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-bold tabular-nums text-slate-300">{fmt(sec)}</span>
        <Loader2 size={12} className="animate-spin text-amber-400/70" />
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-500/70 to-amber-400/40 transition-[width] duration-100"
          style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] text-amber-400/70">processing…</p>
    </div>
  );
}

function OurTimer({ run }: { run: boolean }) {
  const [sec, setSec]   = useState(0);
  const [done, setDone] = useState(false);
  const raf = useRef<number>();

  useEffect(() => {
    if (!run) return;
    let start: number | null = null;
    const LOOP = 7000;     // re-sync with their loop
    const FILL = 900;      // we finish in <1s of real time → shows 0:03
    const TARGET = 3;      // 0:03
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = (now - start) % LOOP;
      if (t < FILL) {
        const p = t / FILL;
        const eased = 1 - Math.pow(1 - p, 3);
        setSec(eased * TARGET);
        setDone(false);
      } else {
        setSec(TARGET);
        setDone(true);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [run]);

  const pct = done ? 100 : (sec / 3) * 100;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.07] p-3">
      {done && <div className="anim-glow pointer-events-none absolute -inset-4 -z-10 bg-emerald-500/20 blur-2xl" />}
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">OlomiPay</p>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-bold tabular-nums text-white">{fmt(sec)}</span>
        {done && <Check size={14} className="text-emerald-400" />}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-[width] duration-100"
          style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] font-semibold text-emerald-300">
        {done ? '✓ Settled on-chain' : 'settling…'}
      </p>
    </div>
  );
}
