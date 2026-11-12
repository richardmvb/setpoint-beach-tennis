import { TournamentState } from './models';

export type SyncKind = 'shared' | 'local';

export interface SyncRecord {
  version: 1;
  base: TournamentState;
  pending: TournamentState | null;
  revision: number;
}

export class OfflineSyncQueue {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}

  read(kind: SyncKind, id: string): SyncRecord | null {
    const raw = this.storage.getItem(this.key(kind, id));
    if (!raw) return null;
    try {
      const record = JSON.parse(raw) as SyncRecord;
      if (record.version !== 1 || !record.base || !Number.isSafeInteger(record.revision)) return null;
      return record;
    } catch {
      return null;
    }
  }

  initialize(kind: SyncKind, id: string, base: TournamentState): void {
    if (this.read(kind, id)) return;
    this.write(kind, id, { version: 1, base, pending: null, revision: 0 });
  }

  refreshBase(kind: SyncKind, id: string, base: TournamentState): boolean {
    const record = this.read(kind, id);
    if (record?.pending) return false;
    this.write(kind, id, { version: 1, base, pending: null, revision: record?.revision ?? 0 });
    return true;
  }

  stage(kind: SyncKind, id: string, state: TournamentState): boolean {
    const record = this.read(kind, id);
    if (!record) return false;
    record.pending = state;
    record.revision++;
    this.write(kind, id, record);
    return true;
  }

  acknowledge(kind: SyncKind, id: string, revision: number, base: TournamentState): void {
    const record = this.read(kind, id);
    if (!record) return;
    record.base = base;
    if (record.revision === revision) record.pending = null;
    this.write(kind, id, record);
  }

  remove(kind: SyncKind, id: string): void {
    this.storage.removeItem(this.key(kind, id));
  }

  private write(kind: SyncKind, id: string, record: SyncRecord): void {
    this.storage.setItem(this.key(kind, id), JSON.stringify(record));
  }

  private key(kind: SyncKind, id: string): string {
    return `setpoint.sync.${kind}.${id}`;
  }
}
