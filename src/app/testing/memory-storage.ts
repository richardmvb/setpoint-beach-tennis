/** In-memory `Storage` stand-in for specs; `limit` caps the total characters to simulate a full quota. */
export class MemoryStorage {
  private readonly map = new Map<string, string>();

  constructor(private readonly limit = Infinity) {}

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    let used = 0;
    for (const [k, v] of this.map) if (k !== key) used += k.length + v.length;
    if (used + key.length + value.length > this.limit) throw new Error('QuotaExceededError');
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}
