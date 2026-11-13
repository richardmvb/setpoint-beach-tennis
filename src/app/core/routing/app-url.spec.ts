import { describe, expect, it } from 'vitest';
import {
  baseLiveUrl,
  basePathOf,
  dashboardUrl,
  dashboardViewerUrl,
  inviteUrl,
  isDashboardPath,
  liveTokenOf,
  liveUrl,
  parseUrl,
} from './app-url';

const at = (pathname: string, search = '', hash = '') => parseUrl({ pathname, search, hash });
const ROOT = 'https://app.example/';
const PAGES = 'https://user.github.io/setpoint-beach-tennis/';

describe('parseUrl', () => {
  it('reads nothing special at the root', () => {
    expect(at('/')).toEqual({
      inviteToken: '',
      liveToken: '',
      dashboardViewerId: '',
      dashboardViewerSource: null,
      dashboardPath: false,
      authCallback: false,
    });
  });

  it('reads an invite token', () => {
    expect(at('/', '?invite=abc').inviteToken).toBe('abc');
  });

  it('reads a live token', () => {
    expect(at('/', '?live=xyz').liveToken).toBe('xyz');
  });

  it('reads the admin viewer id and a valid source', () => {
    expect(at('/', '?dashboardTournament=t1&source=local')).toMatchObject({
      dashboardViewerId: 't1',
      dashboardViewerSource: 'local',
    });
    expect(at('/', '?dashboardTournament=t1&source=shared').dashboardViewerSource).toBe('shared');
  });

  it('keeps the viewer id but no source when the source is missing or not allowed', () => {
    expect(at('/', '?dashboardTournament=t1')).toMatchObject({ dashboardViewerId: 't1', dashboardViewerSource: null });
    expect(at('/', '?dashboardTournament=t1&source=other').dashboardViewerSource).toBeNull();
  });

  it('recognizes the dashboard path under any base, with or without a trailing slash', () => {
    for (const path of [
      '/dashboard',
      '/dashboard/',
      '/setpoint-beach-tennis/dashboard',
      '/setpoint-beach-tennis/dashboard/',
    ]) {
      expect(at(path).dashboardPath, path).toBe(true);
    }
    for (const path of ['/', '/setpoint-beach-tennis/', '/dashboards', '/dashboard-old', '/x/dashboard/y']) {
      expect(at(path).dashboardPath, path).toBe(false);
    }
  });

  it('recognizes a Supabase sign-in return by its code or by its access token', () => {
    expect(at('/dashboard', '?code=123').authCallback).toBe(true);
    expect(at('/dashboard', '', '#access_token=abc&refresh_token=def').authCallback).toBe(true);
    expect(at('/dashboard', '', '#other=1').authCallback).toBe(false);
  });

  it('keeps every parameter when several are present, and ignores unknown ones', () => {
    expect(at('/', '?invite=a&live=b&utm_source=x&foo=bar')).toMatchObject({ inviteToken: 'a', liveToken: 'b' });
  });
});

describe('isDashboardPath', () => {
  it('matches only a final dashboard segment', () => {
    expect(isDashboardPath('/dashboard')).toBe(true);
    expect(isDashboardPath('/a/b/dashboard///')).toBe(true);
    expect(isDashboardPath('/dashboard/x')).toBe(false);
  });
});

describe('basePathOf', () => {
  it('is empty at the root and the folder on GitHub Pages, with no trailing slash', () => {
    expect(basePathOf(ROOT)).toBe('');
    expect(basePathOf(PAGES)).toBe('/setpoint-beach-tennis');
    expect(basePathOf('https://x.test/a/b')).toBe('/a/b');
  });
});

describe('links the app makes', () => {
  it('invite link: the current page with only the invite parameter', () => {
    expect(inviteUrl('https://app.example/?live=old#hash', 'tok')).toBe('https://app.example/?invite=tok');
    expect(inviteUrl('https://user.github.io/setpoint-beach-tennis/?x=1', 'a b')).toBe(
      'https://user.github.io/setpoint-beach-tennis/?invite=a+b',
    );
  });

  it('live link: the current page with only the live parameter', () => {
    expect(liveUrl('https://app.example/?invite=old', 'tok')).toBe('https://app.example/?live=tok');
  });

  it('keeps the current path, like it always did (even on /dashboard)', () => {
    expect(inviteUrl('https://app.example/dashboard?x=1', 'tok')).toBe('https://app.example/dashboard?invite=tok');
  });

  it('final report live link: at the app root', () => {
    expect(baseLiveUrl(ROOT, 'tok')).toBe('https://app.example/?live=tok');
    expect(baseLiveUrl(PAGES, 'tok')).toBe('https://user.github.io/setpoint-beach-tennis/?live=tok');
  });

  it('admin viewer link: root with the tournament and its source', () => {
    expect(dashboardViewerUrl(PAGES, 't1', 'local')).toBe(
      'https://user.github.io/setpoint-beach-tennis/?dashboardTournament=t1&source=local',
    );
  });

  it('sign-in return link: the dashboard path under the base, with no query or hash', () => {
    expect(dashboardUrl(ROOT)).toBe('https://app.example/dashboard');
    expect(dashboardUrl(PAGES)).toBe('https://user.github.io/setpoint-beach-tennis/dashboard');
  });

  it('every link round-trips through parseUrl', () => {
    const invite = new URL(inviteUrl(ROOT, 'abc 123&x'));
    expect(parseUrl(invite).inviteToken).toBe('abc 123&x');
    const live = new URL(liveUrl(PAGES, 'tok/with?chars'));
    expect(parseUrl(live).liveToken).toBe('tok/with?chars');
    const viewer = new URL(dashboardViewerUrl(PAGES, 'id-1', 'shared'));
    expect(parseUrl(viewer)).toMatchObject({ dashboardViewerId: 'id-1', dashboardViewerSource: 'shared' });
    expect(parseUrl(new URL(dashboardUrl(PAGES))).dashboardPath).toBe(true);
  });
});

describe('liveTokenOf', () => {
  it('reads the token of a live link, and gives null for anything else', () => {
    expect(liveTokenOf('https://app.example/?live=tok')).toBe('tok');
    expect(liveTokenOf('https://app.example/')).toBeNull();
    expect(liveTokenOf('not a url')).toBeNull();
    expect(liveTokenOf('')).toBeNull();
  });
});
