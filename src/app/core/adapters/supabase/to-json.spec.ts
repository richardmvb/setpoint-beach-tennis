import { describe, expect, it } from 'vitest';
import { toJson } from './to-json';

describe('toJson', () => {
  it('drops undefined fields like the network does', () => {
    expect(toJson({ a: 1, b: undefined })).toEqual({ a: 1 });
  });

  it('turns undefined into null', () => {
    expect(toJson(undefined)).toBeNull();
  });
});
