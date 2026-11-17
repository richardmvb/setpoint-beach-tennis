import type { Connectivity } from '../connectivity.port';

/** A connection that only changes when the test says so. */
export class FakeConnectivity implements Connectivity {
  private current: boolean;
  private readonly listeners = new Set<(online: boolean) => void>();

  constructor(online = true) {
    this.current = online;
  }

  online(): boolean {
    return this.current;
  }

  onChange(callback: (online: boolean) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  set(online: boolean): void {
    this.current = online;
    for (const listener of [...this.listeners]) listener(online);
  }

  /** How many listeners are attached (a stopped one is gone). */
  listening(): number {
    return this.listeners.size;
  }
}
