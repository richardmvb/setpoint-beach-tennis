import { inject, Injectable, InjectionToken } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { SetupProgress } from '../../../core/setup-progress';
import { SetupStore } from './setup.store';
import { type TourStop, tourStops } from './setup-tour-steps';

/** Loads driver.js when a tour starts. A token so a spec can hand in a fake instead of the real library. */
export const DRIVER_LOADER = new InjectionToken<() => Promise<Pick<typeof import('driver.js'), 'driver'>>>(
  'DriverLoader',
  { providedIn: 'root', factory: () => () => import('driver.js') },
);

/**
 * Runs the setup tour (driver.js, loaded when a tour starts): the stops of the current step, with their words from
 * the `setup` scope. What is remembered on the device and what analytics hears is the store's. Provided by the page.
 */
@Injectable()
export class SetupTour {
  private readonly store = inject(SetupStore);
  private readonly progress = inject(SetupProgress);
  private readonly transloco = inject(TranslocoService);
  private readonly loadDriver = inject(DRIVER_LOADER);

  /** Starts the tour only when it is on and this step's tour has not been seen. */
  async startIfDue(): Promise<void> {
    if (this.store.shouldAutoStartTour(this.progress.step())) await this.start();
  }

  async start(): Promise<void> {
    const step = this.progress.step();
    const stops = tourStops(step, (selector) => !!document.querySelector(selector));
    if (!stops.length) return;
    const { driver } = await this.loadDriver();
    let finished = false;
    const tour = driver({
      showProgress: true,
      allowClose: true,
      allowKeyboardControl: true,
      smoothScroll: true,
      animate: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      popoverClass: 'sp-tour',
      overlayOpacity: 0.58,
      stagePadding: 8,
      stageRadius: 14,
      nextBtnText: this.transloco.translate('tour.buttons.next', {}, 'setup/pt-BR'),
      prevBtnText: this.transloco.translate('tour.buttons.previous', {}, 'setup/pt-BR'),
      doneBtnText: this.transloco.translate('tour.buttons.done', {}, 'setup/pt-BR'),
      // driver.js fills {{current}} and {{total}}; Transloco would read them as its own, so the text keeps [[...]].
      progressText: this.transloco
        .translate('tour.buttons.progress', {}, 'setup/pt-BR')
        .replace('[[current]]', '{{current}}')
        .replace('[[total]]', '{{total}}'),
      steps: stops.map((stop) => ({
        element: stop.element,
        popover: { ...this.words(stop), ...(stop.side ? { side: stop.side } : {}) },
      })),
      onPopoverRender: (popover) => {
        const off = document.createElement('button');
        off.type = 'button';
        off.textContent = this.transloco.translate('tour.buttons.off', {}, 'setup/pt-BR');
        off.className = 'tour-off';
        off.onclick = () => {
          finished = true;
          this.store.tourSwitchedOff(step);
          tour.destroy();
        };
        popover.footer.appendChild(off);
      },
      onDestroyed: () => {
        if (finished) return;
        finished = true;
        this.store.tourFinished(step);
      },
    });
    this.store.tourStarted(step);
    tour.drive();
  }

  private words(stop: TourStop): { title: string; description: string } {
    switch (stop.id) {
      case 'name':
        return {
          title: this.transloco.translate('tour.name.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.name.description', {}, 'setup/pt-BR'),
        };
      case 'hosting':
        return {
          title: this.transloco.translate('tour.hosting.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.hosting.description', {}, 'setup/pt-BR'),
        };
      case 'doubles':
        return {
          title: this.transloco.translate('tour.doubles.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.doubles.description', {}, 'setup/pt-BR'),
        };
      case 'mode':
        return {
          title: this.transloco.translate('tour.mode.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.mode.description', {}, 'setup/pt-BR'),
        };
      case 'size':
        return {
          title: this.transloco.translate('tour.size.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.size.description', {}, 'setup/pt-BR'),
        };
      case 'summary':
        return {
          title: this.transloco.translate('tour.summary.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.summary.description', {}, 'setup/pt-BR'),
        };
      case 'next':
        return {
          title: this.transloco.translate('tour.next.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.next.description', {}, 'setup/pt-BR'),
        };
      case 'addPlayer':
        return {
          title: this.transloco.translate('tour.addPlayer.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.addPlayer.description', {}, 'setup/pt-BR'),
        };
      case 'batch':
        return {
          title: this.transloco.translate('tour.batch.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.batch.description', {}, 'setup/pt-BR'),
        };
      case 'invite':
        return {
          title: this.transloco.translate('tour.invite.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.invite.description', {}, 'setup/pt-BR'),
        };
      case 'progress':
        return {
          title: this.transloco.translate('tour.progress.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.progress.description', {}, 'setup/pt-BR'),
        };
      case 'review':
        return {
          title: this.transloco.translate('tour.review.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.review.description', {}, 'setup/pt-BR'),
        };
      case 'reviewSummary':
        return {
          title: this.transloco.translate('tour.reviewSummary.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.reviewSummary.description', {}, 'setup/pt-BR'),
        };
      case 'roster':
        return {
          title: this.transloco.translate('tour.roster.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.roster.description', {}, 'setup/pt-BR'),
        };
      case 'generate':
        return {
          title: this.transloco.translate('tour.generate.title', {}, 'setup/pt-BR'),
          description: this.transloco.translate('tour.generate.description', {}, 'setup/pt-BR'),
        };
    }
  }
}
