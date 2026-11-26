import { describe, expect, it } from 'vitest';
import { shuffleFrames } from './shuffle-frames';

describe('shuffleFrames', () => {
  it('ends on the drawn order, every frame holds the same ids, and two frames in a row always differ', () => {
    for (const size of [2, 3, 4, 7, 9, 12]) {
      const order = Array.from({ length: size }, (_, index) => `p${index + 1}`);
      const frames = shuffleFrames(order, 9);
      expect(frames).toHaveLength(9);
      expect(frames.at(-1)).toEqual(order);
      for (const frame of frames) expect([...frame].sort()).toEqual([...order].sort());
      for (let index = 1; index < frames.length; index++) expect(frames[index]).not.toEqual(frames[index - 1]);
    }
  });

  it('shows the order alone when there is nothing to shuffle, and leaves its input alone', () => {
    expect(shuffleFrames(['p1'], 9)).toEqual([['p1']]);
    const order = ['a', 'b', 'c'];
    shuffleFrames(order, 5);
    expect(order).toEqual(['a', 'b', 'c']);
  });
});
