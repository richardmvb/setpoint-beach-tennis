import type { SetupStepNumber } from '../../../core/setup-progress';

/** Which part of the wizard a tour stop points at. The words are keyed `tour.<id>.title` and `.description`. */
type TourStopId =
  | 'name'
  | 'hosting'
  | 'doubles'
  | 'mode'
  | 'size'
  | 'summary'
  | 'next'
  | 'addPlayer'
  | 'batch'
  | 'invite'
  | 'progress'
  | 'review'
  | 'reviewSummary'
  | 'roster'
  | 'generate';

export interface TourStop {
  id: TourStopId;
  /** The element the popover points at; a stop whose element is not on the page is skipped. */
  element: string;
  side?: 'top';
}

const STOPS: Record<SetupStepNumber, TourStop[]> = {
  1: [
    { id: 'name', element: '#setupName' },
    { id: 'hosting', element: '#hostingMode' },
    { id: 'doubles', element: '#doublesFormat' },
    { id: 'mode', element: '#tournamentMode' },
    { id: 'size', element: '#setupSize' },
    { id: 'summary', element: '#setupSummary' },
    { id: 'next', element: '#setupNext', side: 'top' },
  ],
  2: [
    { id: 'addPlayer', element: '[data-tour="add-player"]' },
    { id: 'batch', element: '.batch-entry-button' },
    { id: 'invite', element: '.shared-invite-panel' },
    { id: 'progress', element: '#enrollProgress' },
    { id: 'review', element: '#setupNext2', side: 'top' },
  ],
  3: [
    { id: 'reviewSummary', element: '#reviewSummary' },
    { id: 'roster', element: '.wizard-roster' },
    { id: 'generate', element: '#generateBtn', side: 'top' },
  ],
};

/** The tour stops of a step, in order, keeping only those whose element `exists` on the page. */
export function tourStops(step: SetupStepNumber, exists: (selector: string) => boolean): TourStop[] {
  return STOPS[step].filter((stop) => exists(stop.element));
}

/** Where the tour is remembered on the device: the first step under the base key, the others with a suffix. */
export const TUTORIAL_KEY = 'setpoint.tutorial.setup';
export function tourKey(step: SetupStepNumber): string {
  return step === 1 ? TUTORIAL_KEY : `${TUTORIAL_KEY}.step${step}`;
}
