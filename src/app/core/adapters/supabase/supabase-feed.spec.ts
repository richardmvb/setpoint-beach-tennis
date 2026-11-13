import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { feedContract } from '../../ports/testing/feed.contract';
import { fakeSupabase } from './fake-supabase-client';
import { SUPABASE_CLIENT } from './supabase-client';
import { SupabaseFeed } from './supabase-feed';

function setup() {
  TestBed.resetTestingModule();
  const supabase = fakeSupabase();
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: supabase.client }] });
  return { supabase, feed: TestBed.inject(SupabaseFeed) };
}

feedContract('SupabaseFeed', () => {
  const { supabase, feed } = setup();
  const channelFor = (kind: 'local' | 'shared', id: string) =>
    supabase.channels.get(kind === 'local' ? `local-live:${id}` : `shared-tournament:${id}`);
  return { port: feed, trigger: (kind, id) => channelFor(kind, id)?.emit() };
});

describe('SupabaseFeed', () => {
  it('uses one channel per watched tournament and removes the old one when it is replaced', () => {
    const { supabase, feed } = setup();
    feed.watchShared('t-1', () => undefined);
    feed.watchShared('t-1', () => undefined);
    expect(supabase.removed).toEqual(['shared-tournament:t-1']);
  });

  it('broadcasts a refresh over the open channel when the tournament is being watched', async () => {
    const { supabase, feed } = setup();
    feed.watchShared('t-1', () => undefined);
    await feed.broadcastShared('t-1');
    expect(supabase.channels.get('shared-tournament:t-1')?.sent).toEqual([
      { type: 'broadcast', event: 'refresh', payload: {} },
    ]);
  });

  it('broadcasts over a short-lived channel when nobody here is watching, and removes it afterwards', async () => {
    const { supabase, feed } = setup();
    await feed.broadcastShared('t-2');
    expect(supabase.removed).toEqual(['shared-tournament:t-2']);
  });

  it('notifies viewers of a local tournament the same way', async () => {
    const { supabase, feed } = setup();
    await feed.notifyLocal('live-1');
    expect(supabase.removed).toEqual(['local-live:live-1']);
  });
});
