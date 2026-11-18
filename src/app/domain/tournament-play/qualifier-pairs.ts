import type { FinalsPairing } from '../../core/models';
import { shuffledOrder } from './tie-draw';

/**
 * The six pairs of the 20-player finals, D1 to D6, from the 12 qualifiers in seed order.
 * Crossed: 1+3, 2+4, 5+7, 6+8, 9+11, 10+12. Seeded draw: each of the six best is a head of a pair (D1 to D6, in
 * seed order) and gets a partner drawn among seeds 7 to 12. The randomness is injected.
 */
export function pairQualifiers(
  seeding: readonly string[],
  pairing: FinalsPairing,
  randomInt: (maxExclusive: number) => number,
): [string, string][] {
  if (seeding.length !== 12) throw new Error('A chave exige doze classificados.');
  if (pairing === 'crossed') {
    return [0, 1, 4, 5, 8, 9].map((index): [string, string] => [seeding[index], seeding[index + 2]]);
  }
  const partners = shuffledOrder(seeding.slice(6), randomInt);
  return seeding.slice(0, 6).map((head, index): [string, string] => [head, partners[index]]);
}
