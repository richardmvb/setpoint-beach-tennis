import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { shellFakes } from '../testing/shell-fakes';
import { ShellContext } from './shell-context';

beforeEach(() => TestBed.resetTestingModule());

describe('ShellContext', () => {
  it('is the owner session on the home address', () => {
    TestBed.configureTestingModule({ providers: shellFakes().providers });
    const context = TestBed.inject(ShellContext);
    expect(context.isSharedView).toBe(false);
    expect(context.startsOnDashboard).toBe(false);
  });

  it("is a shared view when the address opens someone else's tournament, reporting its hosting mode", () => {
    TestBed.configureTestingModule({ providers: shellFakes({ sharedView: true }).providers });
    const context = TestBed.inject(ShellContext);
    expect(context.isSharedView).toBe(true);
    expect(context.viewerHostingMode).toBe('local');
  });

  it('is not a shared view on the dashboard', () => {
    TestBed.configureTestingModule({ providers: shellFakes({ dashboard: true, sharedView: true }).providers });
    const context = TestBed.inject(ShellContext);
    expect(context.isSharedView).toBe(false);
    expect(context.startsOnDashboard).toBe(true);
  });
});
