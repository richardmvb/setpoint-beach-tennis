import type { AppSupabaseClient } from './supabase-client';

interface Reply {
  data?: unknown;
  error?: { code?: string; message: string } | null;
}

/** A channel that records what is sent and lets a test simulate a broadcast from another device. */
export class FakeChannel {
  readonly sent: unknown[] = [];
  private handlers: (() => void)[] = [];
  constructor(readonly name: string) {}
  on(_type: string, _filter: unknown, handler: () => void): this {
    this.handlers.push(handler);
    return this;
  }
  subscribe(onStatus?: (status: string) => void): this {
    onStatus?.('SUBSCRIBED');
    return this;
  }
  send(message: unknown): Promise<string> {
    this.sent.push(message);
    return Promise.resolve('ok');
  }
  /** Another device changed the tournament. */
  emit(): void {
    for (const handler of this.handlers) handler();
  }
}

/** The parts of supabase-js the adapters use, recording every call. Replies are set per RPC name. */
export function fakeSupabase(options: { signedIn?: boolean } = {}) {
  const rpcCalls: { name: string; params: unknown }[] = [];
  const replies = new Map<string, Reply>();
  const channels = new Map<string, FakeChannel>();
  const removed: string[] = [];
  const auth = { signedIn: options.signedIn ?? false, signInCalls: 0 };

  const client = {
    rpc: (name: string, params?: unknown) => {
      rpcCalls.push({ name, params });
      const reply = replies.get(name) ?? {};
      return Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null });
    },
    auth: {
      getUser: () =>
        Promise.resolve(
          auth.signedIn
            ? { data: { user: { id: 'u-1' } }, error: null }
            : { data: { user: null }, error: new Error('no session') },
        ),
      signInAnonymously: () => {
        auth.signInCalls++;
        auth.signedIn = true;
        return Promise.resolve({ error: null });
      },
    },
    channel: (name: string) => {
      const channel = new FakeChannel(name);
      channels.set(name, channel);
      return channel;
    },
    removeChannel: (channel: FakeChannel) => {
      removed.push(channel.name);
      if (channels.get(channel.name) === channel) channels.delete(channel.name);
      return Promise.resolve('ok');
    },
  } as unknown as AppSupabaseClient;

  return {
    client,
    auth,
    rpcCalls,
    removed,
    channels,
    reply: (name: string, value: Reply) => void replies.set(name, value),
    calls: (name: string) => rpcCalls.filter((call) => call.name === name).map((call) => call.params),
  };
}
