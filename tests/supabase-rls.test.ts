/**
 * Applies the Supabase migration + generated seed to PGlite with a minimal stub of
 * Supabase's auth schema/roles, then checks Row Level Security as the
 * `authenticated` role. This validates the SQL and policies; it is NOT a substitute
 * for running against a real Supabase project (Auth, Realtime, Edge Functions).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';

const STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb, is_anonymous boolean default false);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

let db: PGlite;
const ALICE = '00000000-0000-4000-8000-00000000000a';
const BOB = '00000000-0000-4000-8000-00000000000b';

async function as<T>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  for (const file of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  await db.exec(readFileSync('supabase/seed.sql', 'utf8'));
  await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"username":"Alice"}'), ($2, '{"username":"Alice"}')`, [
    ALICE,
    BOB,
  ]);
  // service-side setup (what an Edge Function would do)
  await db.exec(`
    insert into rooms (id, code, name, host_id, is_public, settings) values
      ('10000000-0000-4000-8000-000000000001', 'PUBLC2', 'Open Arena', '${ALICE}', true, '{}'),
      ('10000000-0000-4000-8000-000000000002', 'PRIVT3', 'Secret Arena', '${ALICE}', false, '{}');
    insert into room_players (room_id, user_id) values
      ('10000000-0000-4000-8000-000000000001', '${ALICE}'),
      ('10000000-0000-4000-8000-000000000002', '${ALICE}');
  `);
});
afterAll(async () => db?.close());

describe('supabase migration + RLS', () => {
  it('seeds questions and auto-creates unique profiles + stats for new auth users', async () => {
    const [{ n }] = (await db.query<{ n: number }>('select count(*)::int n from questions')).rows;
    expect(n).toBeGreaterThanOrEqual(100);
    const profiles = (await db.query<{ id: string; username: string }>('select id, username from profiles order by username')).rows;
    expect(profiles).toHaveLength(2);
    expect(profiles.find((p) => p.id === ALICE)?.username).toBe('Alice');
    expect(profiles.find((p) => p.id === BOB)?.username).toMatch(/^Warrior_/); // duplicate name was replaced
    const [{ s }] = (await db.query<{ s: number }>('select count(*)::int s from player_stats')).rows;
    expect(s).toBe(2);
  });

  it('never exposes questions or correct answers to clients', async () => {
    await expect(as(ALICE, 'select * from questions')).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, 'select correct_index from match_questions')).rejects.toThrow(/permission denied/);
    await expect(as(null, 'select * from questions')).rejects.toThrow(/permission denied/);
  });

  it('shows public rooms to everyone signed in, private rooms only to members', async () => {
    const bobRooms = await as<{ name: string }>(BOB, 'select name from rooms');
    expect(bobRooms.map((r) => r.name)).toEqual(['Open Arena']);
    const aliceRooms = await as<{ name: string }>(ALICE, 'select name from rooms order by name');
    expect(aliceRooms.map((r) => r.name)).toEqual(['Open Arena', 'Secret Arena']);
    expect(await as(BOB, 'select * from room_players')).toHaveLength(0);
    expect(await as(null, 'select * from rooms')).toHaveLength(0);
  });

  it('blocks direct client writes to game state and scores', async () => {
    await expect(as(BOB, `insert into rooms (code, name, host_id, settings) values ('HACKR2','Hack','${BOB}','{}')`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(as(BOB, `update player_stats set total_points = 999999 where user_id = '${BOB}'`)).rejects.toThrow(/permission denied/);
    await expect(as(BOB, `update profiles set xp = 999999 where id = '${BOB}'`)).rejects.toThrow(/permission denied/);
    await expect(
      as(BOB, `insert into answers (match_id, idx, user_id, choice, is_correct, response_ms, points) values (gen_random_uuid(),0,'${BOB}',0,true,1,200)`),
    ).rejects.toThrow(/permission denied/);
  });

  it('lets players edit only their own username/avatar', async () => {
    await as(BOB, `update profiles set username = 'Bobby', avatar = 'oni' where id = '${BOB}'`);
    await as(BOB, `update profiles set username = 'Pwned' where id = '${ALICE}'`); // silently filtered by RLS
    const rows = (await db.query<{ id: string; username: string }>('select id, username from profiles')).rows;
    expect(rows.find((r) => r.id === BOB)?.username).toBe('Bobby');
    expect(rows.find((r) => r.id === ALICE)?.username).toBe('Alice');
  });
});
