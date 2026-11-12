/**
 * The pieces of Supabase these PGlite tests need so migrations can run without Docker: the API roles,
 * the auth schema with auth.users and auth.uid(), and the extensions schema.
 * This is a fast stand-in only. Grants, permissions and JWT behaviour are proven against the real stack in
 * supabase/tests/security.test.sql (npm run test:db:supabase).
 */
const FAKE_SUPABASE_SQL = `
  create role anon;
  create role authenticated;
  create schema auth;
  create schema extensions;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
`;

module.exports = { FAKE_SUPABASE_SQL };
