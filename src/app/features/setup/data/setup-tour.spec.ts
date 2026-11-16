import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import setupPtBr from '../../../../../public/i18n/setup/pt-BR.json';
import { translocoTesting } from '../../../testing/transloco-testing';
import { setupFakes } from '../setup.fakes';
import { DRIVER_LOADER, SetupTour } from './setup-tour';
import { SetupStore } from './setup.store';

interface FakeConfig {
  steps: { element: string; popover: { title: string; description: string; side?: string } }[];
  nextBtnText: string;
  prevBtnText: string;
  doneBtnText: string;
  progressText: string;
  onPopoverRender: (popover: { footer: HTMLElement }) => void;
  onDestroyed: () => void;
}

function setup() {
  const fakes = setupFakes();
  const tours: { config: FakeConfig; drive: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[] = [];
  const driver = (config: FakeConfig) => {
    const tour = { config, drive: vi.fn(), destroy: vi.fn(() => config.onDestroyed()) };
    tours.push(tour);
    return tour;
  };
  TestBed.configureTestingModule({
    imports: [translocoTesting({ 'setup/pt-BR': setupPtBr })],
    providers: [
      ...fakes.providers,
      SetupStore,
      SetupTour,
      { provide: DRIVER_LOADER, useValue: () => Promise.resolve({ driver }) },
    ],
  });
  return { ...fakes, tours, store: TestBed.inject(SetupStore), tour: TestBed.inject(SetupTour) };
}

const page = (...selectors: string[]) => {
  document.body.innerHTML = selectors.map((selector) => `<div ${selector}></div>`).join('');
};
const step1 = () => page('id="setupName"', 'id="hostingMode"', 'id="setupNext"');

beforeEach(() => TestBed.resetTestingModule());
afterEach(() => {
  document.body.innerHTML = '';
});

describe('SetupTour', () => {
  it('shows the stops that are on the page with their words, and counts the tour as started', async () => {
    const { tour, tours, analytics } = setup();
    step1();
    await tour.start();
    const [{ config, drive }] = tours;
    expect(drive).toHaveBeenCalledOnce();
    expect(config.steps.map((step) => step.element)).toEqual(['#setupName', '#hostingMode', '#setupNext']);
    expect(config.steps[0].popover).toEqual({
      title: 'Nome do torneio',
      description: 'Escolha um nome fácil de reconhecer. Ele aparece no ranking, no relatório e em Meus torneios.',
    });
    expect(config.steps[2].popover.side).toBe('top');
    expect(analytics.calls).toEqual([{ kind: 'capture', event: 'tutorial_started', properties: { step: 1 } }]);
  });

  it('writes the button texts, and hands driver.js its own progress placeholders', async () => {
    const { tour, tours } = setup();
    step1();
    await tour.start();
    const { config } = tours[0];
    expect([config.nextBtnText, config.prevBtnText, config.doneBtnText]).toEqual(['Próximo', 'Voltar', 'Concluir']);
    expect(config.progressText).toBe('{{current}} de {{total}}');
  });

  it('does nothing when none of the stops is on the page', async () => {
    const { tour, tours } = setup();
    page('id="somethingElse"');
    await tour.start();
    expect(tours).toEqual([]);
  });

  it('closing the tour remembers that step as done', async () => {
    const { tour, tours, local, store } = setup();
    step1();
    await tour.start();
    tours[0].config.onDestroyed();
    expect(local.getItem('setpoint.tutorial.setup')).toBe('done');
    expect(store.shouldAutoStartTour(1)).toBe(false);
  });

  it('"Desligar dicas" in the popover turns the tips off and does not count the tour as finished', async () => {
    const { tour, tours, local, store, analytics } = setup();
    step1();
    await tour.start();
    const footer = document.createElement('div');
    tours[0].config.onPopoverRender({ footer });
    const off = footer.querySelector('button');
    expect(off?.textContent).toBe('Desligar dicas');
    off?.click();
    expect(tours[0].destroy).toHaveBeenCalledOnce();
    expect(store.tutorialEnabled()).toBe(false);
    expect(local.getItem('setpoint.tutorial.setup')).toBe('off');
    expect(analytics.calls.map((call) => (call.kind === 'capture' ? call.event : call.kind))).toEqual([
      'tutorial_started',
      'tutorial_disabled',
    ]);
  });

  it('starts by itself only while the tips are on and the step was not seen', async () => {
    const { tour, tours, store } = setup();
    step1();
    store.tourFinished(1);
    await tour.startIfDue();
    expect(tours).toEqual([]);
    TestBed.resetTestingModule();
    const fresh = setup();
    step1();
    await fresh.tour.startIfDue();
    expect(fresh.tours).toHaveLength(1);
  });
});
