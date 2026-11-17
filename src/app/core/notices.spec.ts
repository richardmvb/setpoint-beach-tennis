import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Notices } from './notices';

describe('Notices', () => {
  it('shows one message at a time, as text or as one of the shell keys', () => {
    const notices = TestBed.inject(Notices);
    expect(notices.notice()).toBeNull();
    notices.show('Placar removido.');
    expect(notices.notice()).toEqual({ tone: 'success', text: 'Placar removido.' });
    notices.show('Erro', 'error');
    expect(notices.notice()).toEqual({ tone: 'error', text: 'Erro' });
    notices.showKey('scheduleCount', 'error', { size: 8, count: 3 });
    expect(notices.notice()).toEqual({ tone: 'error', key: 'scheduleCount', params: { size: 8, count: 3 } });
    notices.showKey('newTournament');
    expect(notices.notice()).toMatchObject({ tone: 'success', key: 'newTournament' });
    notices.clear();
    expect(notices.notice()).toBeNull();
  });
});
