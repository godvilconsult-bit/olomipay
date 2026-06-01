'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Scroll-reveal wrapper. Adds `.in-view` when the element scrolls into view,
 * triggering the CSS fadeUp animation. Zero dependencies.
 */
export default function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  delay?: 1 | 2 | 3 | 4 | 0;
  className?: string;
  as?: any;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setShown(true); obs.disconnect(); }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const delayClass = delay ? `reveal-d${delay}` : '';
  return (
    <Tag ref={ref} className={`reveal ${delayClass} ${shown ? 'in-view' : ''} ${className}`}>
      {children}
    </Tag>
  );
}
