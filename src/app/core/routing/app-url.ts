/**
 * The app's URLs, as plain functions. Today's shapes (ADR 0005), relative to the base href:
 *   /                                   the owner's own tournament
 *   /dashboard                          the admin dashboard
 *   /?invite=<token>                    a guest opens a shared tournament
 *   /?live=<token>                      anyone watches a local tournament live
 *   /?dashboardTournament=<id>&source=  an admin views one tournament
 *   ?code=  or  #access_token=          the return from a Supabase email sign-in
 */
export type DashboardSource = 'shared' | 'local';

/** What the address currently says. Several parameters can be present at once, so each is kept separately. */
export interface UrlSnapshot {
  inviteToken: string;
  liveToken: string;
  dashboardViewerId: string;
  /** Null when `source` is missing or is neither `shared` nor `local`. */
  dashboardViewerSource: DashboardSource | null;
  /** True on `<base>/dashboard`. */
  dashboardPath: boolean;
  /** True while the address still carries a Supabase sign-in return (`?code=` or `#access_token=`). */
  authCallback: boolean;
}

export function isDashboardPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '').endsWith('/dashboard');
}

export function parseUrl(location: Pick<Location, 'pathname' | 'search' | 'hash'>): UrlSnapshot {
  const query = new URLSearchParams(location.search);
  const source = query.get('source');
  return {
    inviteToken: query.get('invite') ?? '',
    liveToken: query.get('live') ?? '',
    dashboardViewerId: query.get('dashboardTournament') ?? '',
    dashboardViewerSource: source === 'shared' || source === 'local' ? source : null,
    dashboardPath: isDashboardPath(location.pathname),
    authCallback: query.has('code') || location.hash.includes('access_token='),
  };
}

/** The base href's path without the trailing slash: `''` at the root, `'/setpoint-beach-tennis'` on GitHub Pages. */
export function basePathOf(baseUri: string): string {
  return new URL(baseUri).pathname.replace(/\/+$/, '');
}

function withOnly(href: string, name: string, value: string): string {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(name, value);
  return url.toString();
}

/** The invite link, on the page the owner is looking at. */
export function inviteUrl(currentHref: string, token: string): string {
  return withOnly(currentHref, 'invite', token);
}

/** The live link, on the page the owner is looking at. */
export function liveUrl(currentHref: string, token: string): string {
  return withOnly(currentHref, 'live', token);
}

/** The live link at the app's root (used by the final report). */
export function baseLiveUrl(baseUri: string, token: string): string {
  return withOnly(baseUri, 'live', token);
}

/** An admin link to one tournament, at the app's root. */
export function dashboardViewerUrl(baseUri: string, id: string, source: DashboardSource): string {
  const url = new URL(baseUri);
  url.searchParams.set('dashboardTournament', id);
  url.searchParams.set('source', source);
  return url.toString();
}

/** Where the email sign-in link sends the moderator back to. */
export function dashboardUrl(baseUri: string): string {
  const url = new URL(baseUri);
  url.pathname = `${basePathOf(baseUri)}/dashboard`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

/** The live token inside a live link, or null when the text is not a live link. */
export function liveTokenOf(link: string): string | null {
  try {
    return new URL(link).searchParams.get('live');
  } catch {
    return null;
  }
}
