import React from 'react';

/**
 * Subtle cursor parallax — sets CSS vars --px/--py on the given element
 * (or the document root). Elements with `data-depth` use them:
 *   transform: translate3d(calc(var(--px) * -1 * 8px), calc(var(--py) * -1 * 8px), 0)
 * Disabled on touch devices and prefers-reduced-motion.
 */
export default function useParallax(containerRef, strength = 1) {
  React.useEffect(() => {
    if (!containerRef || !containerRef.current) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (reduce || coarse) return;

    const el = containerRef.current;
    let raf = null;

    const onMove = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        el.style.setProperty('--px', x.toFixed(4));
        el.style.setProperty('--py', y.toFixed(4));
      });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [containerRef, strength]);
}