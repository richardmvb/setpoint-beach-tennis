import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';
import tournamentPtBr from '../../../../public/i18n/tournament/pt-BR.json';
import type { TournamentPhase } from '../../core/state-machines';
import { translocoTesting } from '../../testing/transloco-testing';
import { PhaseLabelComponent } from './phase-label.component';

const labels: Record<TournamentPhase, string> = {
  setup: 'Configuração',
  registration: 'Inscrições',
  ready: 'Pronto para iniciar',
  qualifying: 'Em andamento',
  finals: 'Finais',
  finished: 'Finalizado',
};

describe('PhaseLabelComponent', () => {
  it.each(Object.entries(labels) as [TournamentPhase, string][])('names the %s phase', async (phase, label) => {
    const { container } = await render(PhaseLabelComponent, {
      imports: [translocoTesting({ 'tournament/pt-BR': tournamentPtBr })],
      inputs: { phase },
    });
    expect(screen.getByText(label)).toBeTruthy();
    expect(container.textContent).toBe(label);
  });
});
