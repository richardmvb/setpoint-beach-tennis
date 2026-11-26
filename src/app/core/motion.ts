/** The person asked the system for less motion: animations that only decorate are skipped. */
export function prefersReducedMotion(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Smooth scrolling unless the person asked for less motion (the CSS rule cannot reach `scrollTo` and `scrollIntoView` options). */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
