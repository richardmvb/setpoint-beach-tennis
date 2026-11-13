import { describe, expect, it } from 'vitest';
import type { TournamentFeed } from '../live-feed.port';

export interface FeedHarness {
  port: TournamentFeed;
  /** Simulates another device changing the tournament. */
  trigger: (kind: 'local' | 'shared', id: string) => void;
}

/** Behavior every TournamentFeed implementation must have. */
export function feedContract(name: string, create: () => FeedHarness): void {
  describe(`TournamentFeed contract: ${name}`, () => {
    for (const kind of ['local', 'shared'] as const) {
      const watch = (port: TournamentFeed, id: string, onChange: () => void) =>
        kind === 'local' ? port.watchLocal(id, onChange) : port.watchShared(id, onChange);

      it(`${kind}: calls back when the tournament changes`, () => {
        const { port, trigger } = create();
        let calls = 0;
        watch(port, 't-1', () => calls++);
        trigger(kind, 't-1');
        trigger(kind, 't-1');
        expect(calls).toBe(2);
      });

      it(`${kind}: stops calling back after the returned function runs`, () => {
        const { port, trigger } = create();
        let calls = 0;
        const stop = watch(port, 't-1', () => calls++);
        stop();
        trigger(kind, 't-1');
        expect(calls).toBe(0);
      });

      it(`${kind}: watching the same tournament again replaces the earlier watcher`, () => {
        const { port, trigger } = create();
        const heard: string[] = [];
        watch(port, 't-1', () => heard.push('first'));
        watch(port, 't-1', () => heard.push('second'));
        trigger(kind, 't-1');
        expect(heard).toEqual(['second']);
      });
    }

    it('stopSharedWatch ends a shared watch by id', () => {
      const { port, trigger } = create();
      let calls = 0;
      port.watchShared('t-1', () => calls++);
      port.stopSharedWatch('t-1');
      trigger('shared', 't-1');
      expect(calls).toBe(0);
    });
  });
}
