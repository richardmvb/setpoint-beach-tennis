import { describe, expect, it } from 'vitest';
import { ValiError } from 'valibot';
import { parseJson, toJson } from './json';
import {
  parseDashboardMetrics,
  parseInviteRotation,
  parseLocalLiveCreated,
  parseLocalLiveSnapshot,
  parseSharedSnapshot,
} from './rpc-responses';

const state = { name: 'Torneio', size: 8, players: [] };

describe('RPC response parsers', () => {
  it('accepts a shared tournament snapshot with the fields the app uses', () => {
    const snapshot = parseSharedSnapshot({ id: 'a', status: 'registration', capacity: 8, state, extra: 1 });
    expect(snapshot.id).toBe('a');
    expect(snapshot.state.name).toBe('Torneio');
  });

  it.each([null, undefined, 'x', 42, [], {}, { id: 'a' }, { id: 'a', status: 'x', capacity: '8', state }])(
    'rejects a malformed shared snapshot: %j',
    (payload) => {
      expect(() => parseSharedSnapshot(payload)).toThrow(ValiError);
    },
  );

  it('rejects a snapshot whose state is not a tournament', () => {
    expect(() => parseSharedSnapshot({ id: 'a', status: 'x', capacity: 8, state: { name: 1 } })).toThrow(ValiError);
    expect(() => parseLocalLiveSnapshot({ id: 'a', status: 'active', state: [] })).toThrow(ValiError);
  });

  it('requires all three live tokens', () => {
    expect(parseLocalLiveCreated({ id: 'a', readToken: 'r', writeToken: 'w' }).writeToken).toBe('w');
    expect(() => parseLocalLiveCreated({ id: 'a', readToken: 'r' })).toThrow(ValiError);
  });

  it('requires the invite rotation fields', () => {
    expect(() => parseInviteRotation({ inviteToken: 'x' })).toThrow(ValiError);
  });

  it('rejects dashboard metrics without counters', () => {
    expect(() => parseDashboardMetrics({ tournaments_total: 'many' })).toThrow(ValiError);
  });
});

describe('JSON helpers', () => {
  it('parseJson returns undefined for text that is not JSON', () => {
    expect(parseJson('{oops')).toBeUndefined();
    expect(parseJson(null)).toBeUndefined();
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('toJson drops undefined fields like the network does', () => {
    expect(toJson({ a: 1, b: undefined })).toEqual({ a: 1 });
  });
});
