import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tourKey, tourStops, TUTORIAL_KEY } from './setup-tour-steps';

// The stops point at elements of the wizard's templates, so the spec reads them as text. The unit-test environment is
// not a file: URL, so paths resolve from the workspace root that `ng test` runs in.
const setupDir = join(process.cwd(), 'src/app/features/setup');
const templates = [
  'setup.component.html',
  'components/setup-config.component.html',
  'components/setup-players.component.html',
  'components/setup-review.component.html',
]
  .map((file) => readFileSync(join(setupDir, file), 'utf8'))
  .join('\n');

describe('setup tour steps', () => {
  it('lists the stops of each step in order', () => {
    expect(tourStops(1, () => true).map((stop) => stop.id)).toEqual([
      'name',
      'hosting',
      'doubles',
      'mode',
      'size',
      'summary',
      'next',
    ]);
    expect(tourStops(2, () => true).map((stop) => stop.id)).toEqual([
      'addPlayer',
      'batch',
      'invite',
      'progress',
      'review',
    ]);
    expect(tourStops(3, () => true).map((stop) => stop.id)).toEqual(['reviewSummary', 'roster', 'generate']);
  });

  it('skips a stop whose element is not on the page (no hosting choice without a backend, no invite panel locally)', () => {
    const present = new Set(['#setupName', '#doublesFormat', '#setupNext']);
    expect(tourStops(1, (selector) => present.has(selector)).map((stop) => stop.id)).toEqual([
      'name',
      'doubles',
      'next',
    ]);
  });

  it('points the buttons at the top so they stay in view', () => {
    expect(
      tourStops(1, () => true)
        .filter((stop) => stop.side === 'top')
        .map((stop) => stop.id),
    ).toEqual(['next']);
  });

  it('keeps the base key for step 1 so tours turned off or finished earlier stay so', () => {
    expect(TUTORIAL_KEY).toBe('setpoint.tutorial.setup');
    expect(tourKey(1)).toBe('setpoint.tutorial.setup');
    expect(tourKey(2)).toBe('setpoint.tutorial.setup.step2');
    expect(tourKey(3)).toBe('setpoint.tutorial.setup.step3');
  });

  it('every stop points at an element that a template of the wizard writes', () => {
    const selectors = [1, 2, 3].flatMap((step) => tourStops(step as 1 | 2 | 3, () => true).map((stop) => stop.element));
    expect(selectors).toHaveLength(15);
    for (const selector of selectors) {
      const name = selector.slice(1);
      const found = selector.startsWith('#')
        ? templates.includes(`id="${name}"`) || templates.includes(`inputId="${name}"`)
        : selector.startsWith('.')
          ? templates.includes(name)
          : templates.includes(selector.slice(1, -1));
      expect(found, `no template writes ${selector}`).toBe(true);
    }
  });

  it('every step offers "Ver tutorial" in its frame', () => {
    const page = readFileSync(join(setupDir, 'setup.component.html'), 'utf8');
    expect(page.match(/\(click\)="startTour\(\)"/g) ?? []).toHaveLength(3);
  });
});
