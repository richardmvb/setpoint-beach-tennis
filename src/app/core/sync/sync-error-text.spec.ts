import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import shell from '../../../../public/i18n/pt-BR.json';
import { translocoTesting } from '../../testing/transloco-testing';
import { SyncErrorText } from './sync-error-text';
import type { SyncErrorKey } from './tournament-sync';

describe('SyncErrorText', () => {
  const keys = Object.keys(shell.shell.syncError) as SyncErrorKey[];

  it('has words for every key, and none for no error', () => {
    TestBed.configureTestingModule({ imports: [translocoTesting()] });
    const text = TestBed.inject(SyncErrorText);
    expect(text.text(null)).toBe('');
    for (const key of keys) expect(text.text(key)).toBe(shell.shell.syncError[key]);
    expect(text.text('conflict')).toContain('O torneio mudou em outro dispositivo.');
  });
});
