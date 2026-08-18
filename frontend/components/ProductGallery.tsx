'use client';

/**
 * Product gallery — thumbnail rail, hover-to-switch, click to enlarge.
 *
 * Its own client component so the product page around it stays server-rendered
 * and indexable. Hover switching is the B2B convention (Alibaba, Made-in-China):
 * a buyer scanning eight photos should not have to click eight times.
 *
 * Touch devices get no hover, so thumbnails respond to tap as well — otherwise
 * the rail would be decorative on the phones most of this market uses.
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Store, X, ZoomIn } from 'lucide-react';
import { cn } from './ui';

export default function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  const shots = images.length ? images : [];
  const step = (d: number) => setActive(i => (i + d + shots.length) % shots.length);

  // Arrow keys and Escape while the lightbox is open — a full-screen overlay
  // with no keyboard exit is a trap.
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(false);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomed, shots.length]);

  if (shots.length === 0) {
    return (
      <div className="grid aspect-square place-items-center rounded-ds-xl bg-black/5 dark:bg-white/5">
        <Store className="text-ink/20" size={64} />
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-2.5">
        {/* Thumbnail rail — vertical on desktop, the Alibaba arrangement. */}
        {shots.length > 1 && (
          <div className="flex w-14 shrink-0 flex-col gap-1.5">
            {shots.map((src, i) => (
              <button
                key={i}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                aria-label={`${alt} — image ${i + 1}`}
                aria-current={i === active}
                className={cn(
                  'aspect-square overflow-hidden rounded-lg border-2 transition',
                  i === active ? 'border-flame' : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}

        {/* Main image */}
        <div className="relative min-w-0 flex-1">
          <button
            onClick={() => setZoomed(true)}
            aria-label="Enlarge image"
            className="group block aspect-square w-full overflow-hidden rounded-ds-xl bg-black/5 dark:bg-white/5"
          >
            <img
              src={shots[active]}
              alt={alt}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.06]"
            />
            <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-white/90 text-ink/60 opacity-0 shadow transition group-hover:opacity-100">
              <ZoomIn size={16} />
            </span>
          </button>

          {shots.length > 1 && (
            <>
              <button onClick={() => step(-1)} aria-label="Previous image"
                className="absolute left-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink/70 shadow">
                <ChevronLeft size={18} />
              </button>
              <button onClick={() => step(1)} aria-label="Next image"
                className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink/70 shadow">
                <ChevronRight size={18} />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-ink/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                {active + 1} / {shots.length}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {zoomed && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/90 p-4"
          onClick={() => setZoomed(false)}
          role="dialog"
          aria-modal="true"
        >
          <button onClick={() => setZoomed(false)} aria-label="Close"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white">
            <X size={20} />
          </button>
          <img
            src={shots[active]}
            alt={alt}
            onClick={e => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          {shots.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); step(-1); }} aria-label="Previous"
                className="absolute left-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white">
                <ChevronLeft size={22} />
              </button>
              <button onClick={e => { e.stopPropagation(); step(1); }} aria-label="Next"
                className="absolute right-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white">
                <ChevronRight size={22} />
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
