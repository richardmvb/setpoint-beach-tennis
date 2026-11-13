import type { Routes, UrlMatchResult, UrlSegment } from '@angular/router';

/**
 * `/dashboard`, with or without a trailing slash, exactly like the original `isDashboardPath`. A plain
 * `path: 'dashboard'` does not accept the trailing slash (the router sees it as an extra empty segment).
 */
function dashboardMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  const named = segments.filter((segment) => segment.path !== '');
  return named.length === 1 && named[0]?.path === 'dashboard' ? { consumed: segments } : null;
}

/**
 * The app's paths (ADR 0005). Only `/` and `/dashboard` are paths; everything else the app reads from the query
 * string. There are no components here yet: the page content still lives in AppComponent, and the router only
 * keeps the address. Lazy feature routes are added as features are extracted.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', children: [] },
  { matcher: dashboardMatcher, children: [] },
  // An unknown path opens the app at its root; the query string is kept.
  { path: '**', redirectTo: '' },
];
