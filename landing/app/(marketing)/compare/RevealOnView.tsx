'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

// RevealOnView — opacity/transform-only scroll reveal (Wave 60 compare).
// Reuses the existing `.reveal` / `.reveal.visible` token in globals.css (no
// globals edit). Honesty/SSR note: the comparison content is rendered into the
// DOM on the server regardless of JS — this only animates its appearance, so
// the honest matrix is always present for crawlers, no-JS users, and tests.
//
// A11y: respects prefers-reduced-motion (renders visible immediately, no motion),
// pauses off-screen via IntersectionObserver, and unobserves after the first
// reveal so it never re-runs while scrolling.
export default function RevealOnView({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.unobserve(entry.target); // reveal once; pauses off-screen forever after
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={visible ? 'reveal visible' : 'reveal'}
      style={{ transitionDelay: delay ? `${delay}ms` : undefined, ...style }}
    >
      {children}
    </div>
  );
}
