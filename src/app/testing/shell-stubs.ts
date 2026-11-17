import type { Provider } from '@angular/core';
import { vi } from 'vitest';
import { Notices } from '../core/notices';
import { TournamentPersistence } from '../core/tournament-persistence';

/**
 * Stand-ins for what the features ask of the shell's services: saving the tournament and showing a message. A spec
 * asserts on `hooks` (`save`, `notify`, `clearNotice`) instead of building the sync, the archive and the storage.
 */
export function shellStubs() {
  const hooks = { save: vi.fn(), notify: vi.fn(), clearNotice: vi.fn() };
  const providers: Provider[] = [
    { provide: TournamentPersistence, useValue: { save: hooks.save } },
    {
      provide: Notices,
      useValue: {
        show: (text: string, tone: 'success' | 'error' = 'success'): void => void hooks.notify(text, tone),
        showKey: vi.fn(),
        clear: hooks.clearNotice,
      },
    },
  ];
  return { hooks, providers };
}
