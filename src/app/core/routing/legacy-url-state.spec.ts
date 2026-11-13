import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacyUrlState } from './legacy-url-state';

/** jsdom has no <base>, so give it the GitHub Pages one the app is deployed with. */
function setBase(href: string): () => void {
  const base = document.createElement('base');
  base.href = href;
  document.head.append(base);
  return () => base.remove();
}

describe('LegacyUrlState', () => {
  let removeBase: () => void;

  beforeEach(() => {
    removeBase = setBase(`${window.location.origin}/setpoint-beach-tennis/`);
    window.history.replaceState(null, '', '/setpoint-beach-tennis/');
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    removeBase();
    window.history.replaceState(null, '', '/');
  });

  const make = () => TestBed.inject(LegacyUrlState);

  it('knows the base path from the base href', () => {
    expect(make().basePath).toBe('/setpoint-beach-tennis');
  });

  it('reads the current address', () => {
    window.history.replaceState(null, '', '/setpoint-beach-tennis/?invite=abc&utm=1');
    expect(make().snapshot()).toMatchObject({ inviteToken: 'abc', dashboardPath: false, authCallback: false });
  });

  it('goes to the dashboard and home with the History API, keeping the base path', () => {
    const urlState = make();
    urlState.goToDashboard();
    expect(window.location.pathname).toBe('/setpoint-beach-tennis/dashboard');
    expect(urlState.snapshot().dashboardPath).toBe(true);
    urlState.goHome();
    expect(window.location.pathname).toBe('/setpoint-beach-tennis/');
    expect(urlState.snapshot().dashboardPath).toBe(false);
  });

  it('tells when the person moves back or forward, until told to stop', () => {
    const urlState = make();
    const callback = vi.fn();
    const stop = urlState.onPathChange(callback);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(callback).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('builds the links the app shares, from the current page and from the root', () => {
    window.history.replaceState(null, '', '/setpoint-beach-tennis/?live=old#x');
    const urlState = make();
    expect(urlState.inviteUrl('tok')).toBe(`${window.location.origin}/setpoint-beach-tennis/?invite=tok`);
    expect(urlState.liveUrl('tok')).toBe(`${window.location.origin}/setpoint-beach-tennis/?live=tok`);
    expect(urlState.baseLiveUrl('tok')).toBe(`${window.location.origin}/setpoint-beach-tennis/?live=tok`);
    expect(urlState.dashboardViewerUrl('t1', 'local')).toBe(
      `${window.location.origin}/setpoint-beach-tennis/?dashboardTournament=t1&source=local`,
    );
    expect(urlState.dashboardUrl()).toBe(`${window.location.origin}/setpoint-beach-tennis/dashboard`);
  });

  it('has nothing to clear after a sign-in return: the auth adapter already removed the hash', async () => {
    await expect(make().clearAuthFragment()).resolves.toBeUndefined();
  });
});
