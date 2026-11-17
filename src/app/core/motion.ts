/** Smooth scrolling unless the person asked for less motion (the CSS rule cannot reach `scrollTo` and `scrollIntoView` options). */
export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
