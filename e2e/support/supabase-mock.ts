import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * Mocked Supabase for e2e. `fixtures.ts` already blocks every external host; this helper answers the
 * Supabase requests the app makes (RPC, auth, realtime) with data the test controls. Register it after
 * the fixture `page` is created: Playwright runs the most recently registered route first.
 */

type Json = Record<string, unknown>;
type RpcReply = Json | Json[] | null | ((params: Json) => Json | Json[] | null);

interface RpcFailure {
  message: string;
}

export interface SupabaseMock {
  /** Answer an RPC with a payload, or compute it from the request parameters. */
  rpc(name: string, reply: RpcReply): void;
  /** Make an RPC fail the way PostgREST does when a function raises an exception. */
  fail(name: string, message: string): void;
  /** Parameters of every call made to an RPC, in order. */
  calls(name: string): Json[];
}

const SUPABASE_HOST = /\.supabase\.co(?::\d+)?$/;

const cors = (origin: string, requested: string | undefined): Record<string, string> => ({
  'access-control-allow-origin': origin,
  'access-control-allow-headers': requested ?? '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-max-age': '600',
  vary: 'origin',
});

export async function mockSupabase(page: Page): Promise<SupabaseMock> {
  const replies = new Map<string, RpcReply | RpcFailure>();
  const calls = new Map<string, Json[]>();

  await page.route(
    (url) => SUPABASE_HOST.test(url.host),
    async (route) => {
      const request = route.request();
      const headers = request.headers();
      const origin = headers['origin'] ?? '*';
      const base = cors(origin, headers['access-control-request-headers']);
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: base });

      const url = new URL(request.url());
      const json = (status: number, body: unknown) =>
        route.fulfill({
          status,
          headers: { ...base, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });

      const rpcName = /\/rest\/v1\/rpc\/([^/?]+)/.exec(url.pathname)?.[1];
      if (rpcName) {
        const params = (request.postDataJSON() ?? {}) as Json;
        calls.set(rpcName, [...(calls.get(rpcName) ?? []), params]);
        const reply = replies.get(rpcName);
        if (reply && typeof reply === 'object' && 'message' in reply && !Array.isArray(reply)) {
          return json(400, { code: 'P0001', message: reply.message, details: null, hint: null });
        }
        if (reply === undefined) {
          return json(404, { code: 'PGRST202', message: `no mock for rpc ${rpcName}`, details: null, hint: null });
        }
        const body = typeof reply === 'function' ? reply(params) : reply;
        return json(200, body);
      }

      // Anonymous sign-in: a session that lasts for the whole test.
      if (url.pathname.endsWith('/auth/v1/signup')) {
        const user = { id: 'e2e-anon-user', aud: 'authenticated', role: 'authenticated', is_anonymous: true };
        return json(200, {
          access_token: 'e2e-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'e2e-refresh-token',
          user,
        });
      }
      return json(404, { message: `unmocked supabase request ${request.method()} ${url.pathname}` });
    },
  );

  // Realtime: accept the socket and never push. The app also polls every 4 seconds, which these tests rely on.
  await page.routeWebSocket(
    (url) => SUPABASE_HOST.test(url.host),
    () => undefined,
  );

  return {
    rpc: (name, reply) => void replies.set(name, reply),
    fail: (name, message) => void replies.set(name, { message }),
    calls: (name) => calls.get(name) ?? [],
  };
}

/** The tournament captured from the app (tests/fixtures/persisted/tournament/v1.json), as a plain object. */
export function tournamentFixture(): Json {
  return JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'tests', 'fixtures', 'persisted', 'tournament', 'v1.json'), 'utf8'),
  ) as Json;
}
