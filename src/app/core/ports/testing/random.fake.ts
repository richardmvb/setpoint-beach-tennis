import { seededRandom } from '../../../testing/seeded-random';
import type { Random } from '../random.port';

/** Repeatable randomness: the same seed gives the same sequence, and ids count up in UUID shape. */
export class FakeRandom implements Random {
  private readonly source;
  private counter = 0;

  constructor(seed = 1) {
    this.source = seededRandom(seed);
  }

  next(): number {
    return this.source();
  }
  int(maxExclusive: number): number {
    return Math.floor(this.source() * maxExclusive);
  }
  uuid(): string {
    this.counter++;
    return `00000000-0000-4000-8000-${this.counter.toString(16).padStart(12, '0')}`;
  }
}
