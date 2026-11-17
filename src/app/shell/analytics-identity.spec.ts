import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { shellFakes } from '../testing/shell-fakes';
import { AnalyticsIdentity } from './analytics-identity';

function setup() {
  const fakes = shellFakes();
  TestBed.configureTestingModule({ providers: fakes.providers });
  return { ...fakes, identity: TestBed.inject(AnalyticsIdentity) };
}

const kinds = (calls: { kind: string; userId?: string }[]) =>
  calls
    .filter((call) => call.kind !== 'capture')
    .map((call) => (call.kind === 'identify' ? `identify:${call.userId}` : call.kind));

beforeEach(() => TestBed.resetTestingModule());

describe('AnalyticsIdentity', () => {
  it('identifies the person who is already signed in', async () => {
    const { identity, auth, analytics } = setup();
    await auth.signInAnonymously();
    analytics.calls.length = 0;
    identity.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(kinds(analytics.calls)).toEqual(['identify:anonymous-user']);
  });

  it('identifies a later sign-in and forgets the person on sign-out', async () => {
    const { identity, auth, analytics } = setup();
    identity.start();
    await auth.signInAnonymously();
    expect(kinds(analytics.calls)).toEqual(['identify:anonymous-user']);
    auth.simulateSignOut();
    expect(kinds(analytics.calls)).toEqual(['identify:anonymous-user', 'reset']);
    await auth.signInAnonymously();
    expect(kinds(analytics.calls).at(-1)).toBe('identify:anonymous-user');
  });

  it('listens once however often it is started, and stops listening', async () => {
    const { identity, auth, analytics } = setup();
    identity.start();
    identity.start();
    await auth.signInAnonymously();
    expect(kinds(analytics.calls)).toEqual(['identify:anonymous-user']);
    identity.stop();
    auth.simulateSignOut();
    expect(kinds(analytics.calls)).toEqual(['identify:anonymous-user']);
  });

  it('identifies the current person on demand, and nobody when nobody is signed in', async () => {
    const { identity, auth, analytics } = setup();
    await identity.identifyCurrent();
    expect(kinds(analytics.calls)).toEqual([]);
    await auth.signInAnonymously();
    await identity.identifyCurrent();
    expect(kinds(analytics.calls)).toEqual(['identify:anonymous-user']);
  });
});
