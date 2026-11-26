/**
 * The orders the tie draw shows while it shuffles, ending on the drawn order. They only look random: they are
 * rotations and reversals of the result, so the animation never takes numbers from the random source (the draw
 * itself is made first, and a seeded source gives the same draw with or without the animation). Two frames in a row
 * always differ, so every step moves someone.
 */
export function shuffleFrames(order: readonly string[], count: number): string[][] {
  if (order.length < 2 || count < 1) return [[...order]];
  const step = Math.max(1, Math.floor(order.length / 2) + 1);
  // Built backwards from the result, each frame from the one after it.
  const frames: string[][] = [[...order]];
  for (let index = 1; index < count; index++) {
    const next = frames[0];
    const offset = (index * step) % order.length;
    const frame = [...next.slice(offset), ...next.slice(0, offset)];
    if (index % 2 === 1) frame.reverse();
    frames.unshift(sameOrder(frame, next) ? swapFirstTwo(next) : frame);
  }
  return frames;
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.every((id, index) => id === b[index]);
}

function swapFirstTwo(order: readonly string[]): string[] {
  const [first, second, ...rest] = order;
  return [second, first, ...rest];
}
