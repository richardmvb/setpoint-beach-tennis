import { fireEvent, render, screen } from '@testing-library/angular';
import { afterEach, describe, expect, it, vi } from 'vitest';
import landingPtBr from '../../../../public/i18n/landing/pt-BR.json';
import { translocoTesting } from '../../testing/transloco-testing';
import { landingSeen } from './data/landing-visit';
import { LandingComponent } from './landing.component';
import { landingFakes } from './landing.fakes';

async function setup(savedCount = 0) {
  const fakes = landingFakes({ buildVersion: 3 });
  const emitted: string[] = [];
  await render(LandingComponent, {
    imports: [translocoTesting({ 'landing/pt-BR': landingPtBr })],
    providers: fakes.providers,
    inputs: { savedCount },
    on: { start: () => emitted.push('start'), resume: () => emitted.push('resume') },
  });
  return { ...fakes, emitted };
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });

describe('LandingComponent', () => {
  // jsdom has no scrollIntoView: the section-link test installs a spy and this puts back whatever was there.
  const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  afterEach(() => {
    if (scrollDescriptor) Object.defineProperty(Element.prototype, 'scrollIntoView', scrollDescriptor);
    else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('presents the app and the build version', async () => {
    await setup();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Do sorteio ao pódio, seu torneio roda sozinho.' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Quatro passos e bora para areia.' })).toBeTruthy();
    expect(screen.getByText('BEACH TENNIS · v3')).toBeTruthy();
  });

  it('a first visit is offered to create a tournament and to see how it works, not to resume', async () => {
    const { emitted, local, analytics } = await setup();
    expect(screen.queryByRole('button', { name: /Retomar um torneio/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Meus torneios/ })).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /Criar meu torneio/ })[0]);
    expect(emitted).toEqual(['start']);
    expect(landingSeen(local)).toBe(true);
    expect(analytics.calls.map((call) => call.kind === 'capture' && call.event)).toEqual(['landing_cta_clicked']);
  });

  it('"Abrir o app" also starts', async () => {
    const { emitted } = await setup();
    fireEvent.click(button('Abrir o app'));
    expect(emitted).toEqual(['start']);
  });

  it('with saved tournaments it shows how many and offers to resume them', async () => {
    const { emitted, analytics } = await setup(2);
    expect(screen.queryByRole('button', { name: 'Ver como funciona' })).toBeNull();
    fireEvent.click(button('Meus torneios 2'));
    expect(screen.getAllByRole('button', { name: 'Retomar um torneio' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Retomar um torneio' })[0]);
    expect(emitted).toEqual(['resume', 'resume']);
    expect(analytics.calls.map((call) => call.kind === 'capture' && call.event)).toEqual([
      'landing_library_clicked',
      'landing_library_clicked',
    ]);
  });

  it('the section links scroll to their section', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    await setup();
    const sections: [string, string][] = [
      ['Formatos', 'landing-formats'],
      ['Ao vivo', 'landing-live'],
      ['Seu caminho', 'landing-path'],
      ['Como funciona', 'landing-steps'],
      ['Ver como funciona', 'landing-steps'],
    ];
    for (const [name, id] of sections) {
      scroll.mockClear();
      fireEvent.click(button(name));
      expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
      expect((scroll.mock.contexts[0] as HTMLElement).id).toBe(id);
    }
    expect(screen.getByRole('navigation', { name: 'Seções' })).toBeTruthy();
  });
});
