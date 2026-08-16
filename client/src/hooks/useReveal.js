import React from 'react';

/**
 * Scroll-reveal: adds .in-view to elements with .reveal class
 * when they enter the viewport. Respects prefers-reduced-motion.
 */
export default function useReveal(rootRef) {
  React.useEffect(() => {
    const root = rootRef && rootRef.current ? rootRef.current : document;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const targets = root.querySelectorAll('.reveal');

    if (reduce || !('IntersectionObserver' in window)) {
      targets.forEach((t) => t.classList.add('in-view'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [rootRef]);
}