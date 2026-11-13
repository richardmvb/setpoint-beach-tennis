import { describe, expect, it } from 'vitest';
import { keyValueStoreContract } from '../core/ports/testing/key-value-store.contract';
import { MemoryStorage } from './memory-storage';

keyValueStoreContract('MemoryStorage', () => new MemoryStorage());

describe('MemoryStorage', () => {
  it('throws when the quota is exceeded, like a full Web Storage', () => {
    const store = new MemoryStorage(10);
    expect(() => store.setItem('key', 'a value that is too long')).toThrow('QuotaExceededError');
  });
});
