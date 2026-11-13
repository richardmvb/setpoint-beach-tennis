import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from './app.routes';
import { RouterUrlState } from './router-url-state';

function setup() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter(routes), provideLocationMocks(), RouterUrlState] });
  const router = TestBed.inject(Router);
  return { router, urlState: TestBed.inject(RouterUrlState) };
}

describe('RouterUrlState', () => {
  let router: Router;
  let urlState: RouterUrlState;

  beforeEach(() => {
    ({ router, urlState } = setup());
  });

  it('reads the owner page at the root', async () => {
    await router.navigateByUrl('/');
    expect(urlState.snapshot()).toMatchObject({
      dashboardPath: false,
      inviteToken: '',
      liveToken: '',
      authCallback: false,
    });
  });

  it('reads the dashboard path, with or without a trailing slash', async () => {
    for (const url of ['/dashboard', '/dashboard/', '/dashboard//']) {
      await router.navigateByUrl(url);
      expect(urlState.snapshot().dashboardPath, url).toBe(true);
    }
  });

  it('does not treat a deeper path as the dashboard', async () => {
    for (const url of ['/dashboard/x', '/x/dashboard']) {
      await router.navigateByUrl(url);
      expect(urlState.snapshot().dashboardPath, url).toBe(false);
    }
  });

  it('reads the query shapes: invite, live and the admin viewer', async () => {
    await router.navigateByUrl('/?invite=abc');
    expect(urlState.snapshot().inviteToken).toBe('abc');
    await router.navigateByUrl('/?live=xyz');
    expect(urlState.snapshot().liveToken).toBe('xyz');
    await router.navigateByUrl('/?dashboardTournament=t1&source=shared');
    expect(urlState.snapshot()).toMatchObject({ dashboardViewerId: 't1', dashboardViewerSource: 'shared' });
  });

  it('ignores unknown parameters', async () => {
    await router.navigateByUrl('/?utm_source=x&foo=bar&invite=abc');
    expect(urlState.snapshot().inviteToken).toBe('abc');
  });

  it('opens the root for an unknown path and keeps the query', async () => {
    await router.navigateByUrl('/nowhere?invite=abc');
    expect(urlState.snapshot()).toMatchObject({ dashboardPath: false, inviteToken: 'abc' });
    expect(router.url.startsWith('/?')).toBe(true);
  });

  it('recognizes a sign-in return by its token fragment and by its code', async () => {
    await router.navigateByUrl('/dashboard#access_token=abc&refresh_token=def');
    expect(urlState.snapshot()).toMatchObject({ dashboardPath: true, authCallback: true });
    await router.navigateByUrl('/dashboard?code=123');
    expect(urlState.snapshot().authCallback).toBe(true);
  });

  it('goes to the dashboard and home, and tells listeners until they stop', async () => {
    await router.navigateByUrl('/');
    const heard = vi.fn();
    const stop = urlState.onPathChange(heard);

    urlState.goToDashboard();
    await vi.waitFor(() => expect(urlState.snapshot().dashboardPath).toBe(true));
    urlState.goHome();
    await vi.waitFor(() => expect(urlState.snapshot().dashboardPath).toBe(false));
    expect(heard).toHaveBeenCalledTimes(2);

    stop();
    await router.navigateByUrl('/dashboard');
    expect(heard).toHaveBeenCalledTimes(2);
  });

  describe('clearAuthFragment', () => {
    it('removes the token fragment and keeps the path and the query', async () => {
      await router.navigateByUrl('/dashboard?code=123&x=1#access_token=abc&refresh_token=def');

      await urlState.clearAuthFragment();

      expect(router.url).toBe('/dashboard?code=123&x=1');
      expect(urlState.snapshot()).toMatchObject({ dashboardPath: true, authCallback: true });
    });

    it('does nothing when there is no fragment', async () => {
      await router.navigateByUrl('/?invite=abc');
      const navigations = vi.fn<() => void>();
      router.events.subscribe((event) => {
        if (event instanceof NavigationEnd) navigations();
      });

      await urlState.clearAuthFragment();

      expect(navigations).not.toHaveBeenCalled();
      expect(router.url).toBe('/?invite=abc');
    });

    it('keeps the fragment away after later navigations', async () => {
      await router.navigateByUrl('/dashboard#access_token=abc');
      await urlState.clearAuthFragment();

      await router.navigateByUrl('/');
      await router.navigateByUrl('/dashboard');

      expect(router.url).toBe('/dashboard');
      expect(router.parseUrl(router.url).fragment).toBeNull();
    });
  });

  it('builds the same links as the original implementation (shared base)', () => {
    expect(urlState.dashboardViewerUrl('t1', 'local')).toContain('?dashboardTournament=t1&source=local');
    expect(urlState.dashboardUrl().endsWith('/dashboard')).toBe(true);
  });
});
