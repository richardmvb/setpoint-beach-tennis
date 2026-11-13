import { describe, expect, it } from 'vitest';
import type { AnalyticsPort } from '../analytics.port';
import type { AnalyticsCall } from './analytics.fake';

export interface AnalyticsHarness {
  port: AnalyticsPort;
  /** What the underlying implementation received, in order. */
  sent: () => AnalyticsCall[];
}

/** Behavior every AnalyticsPort implementation must have. Run it against the fake and against the real adapter. */
export function analyticsContract(name: string, create: () => AnalyticsHarness): void {
  describe(`AnalyticsPort contract: ${name}`, () => {
    it('does nothing and does not throw before start()', () => {
      const { port, sent } = create();
      port.capture('app_opened', { view: 'setup' });
      port.identify('user-1');
      port.reset();
      port.logInfo('hello', { a: 1 });
      expect(sent()).toEqual([]);
    });

    it('forwards events, identify and reset in order after start()', () => {
      const { port, sent } = create();
      port.start();
      port.identify('user-1');
      port.capture('app_opened', { view: 'setup', has_schedule: false });
      port.reset();
      expect(sent()).toEqual([
        { kind: 'identify', userId: 'user-1' },
        { kind: 'capture', event: 'app_opened', properties: { view: 'setup', has_schedule: false } },
        { kind: 'reset' },
      ]);
    });

    it('accepts an event without properties', () => {
      const { port, sent } = create();
      port.start();
      port.capture('local_live_link_created');
      expect(sent()).toHaveLength(1);
    });

    it('calling start() twice does not duplicate anything', () => {
      const { port, sent } = create();
      port.start();
      port.start();
      port.capture('app_opened');
      expect(sent()).toHaveLength(1);
    });
  });
}
