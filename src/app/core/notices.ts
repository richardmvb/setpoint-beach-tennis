import { Injectable, signal } from '@angular/core';

/** The shell's own messages, as keys the shell turns into words (`shell.notice.<key>` in the root pt-BR file). */
export type ShellNoticeKey =
  | 'versionReset'
  | 'profileFailed'
  | 'libraryFailed'
  | 'saveFailed'
  | 'scheduleCount'
  | 'scheduleExists'
  | 'sharedStartModerator'
  | 'scheduleFailed'
  | 'scheduleSaved'
  | 'syncWaitNew'
  | 'syncWaitArchive'
  | 'syncWaitSwitch'
  | 'backupTooLarge'
  | 'backupInvalid'
  | 'queueNotUpdated'
  | 'savedOpenFailed'
  | 'newTournament'
  | 'backupLoaded'
  | 'finishedLoaded'
  | 'savedOpened';

export interface Notice {
  tone: 'success' | 'error';
  /** Text that already is words (a feature's notice, an error message). */
  text?: string;
  /** One of the shell's own messages. */
  key?: ShellNoticeKey;
  params?: { size: number; count: number };
}

/** The one message on screen ("Placar removido.", an error): features and the shell post it, the shell shows it. */
@Injectable({ providedIn: 'root' })
export class Notices {
  private readonly current = signal<Notice | null>(null);

  readonly notice = this.current.asReadonly();

  show(text: string, tone: 'success' | 'error' = 'success'): void {
    this.current.set({ tone, text });
  }

  showKey(key: ShellNoticeKey, tone: 'success' | 'error' = 'success', params?: Notice['params']): void {
    this.current.set({ tone, key, params });
  }

  clear(): void {
    this.current.set(null);
  }
}
