import { Injectable, signal } from '@angular/core';

/**
 * The athlete whose path the host is looking at in Projeção; empty means the leader. A root service because the
 * controller the shell provides reads it and the Projeção page writes it.
 */
@Injectable({ providedIn: 'root' })
export class ProjectionTarget {
  private readonly current = signal('');

  readonly playerId = this.current.asReadonly();

  set(playerId: string): void {
    this.current.set(playerId);
  }
}
