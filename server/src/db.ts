import { PGlite } from '@electric-sql/pglite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSeedQuestions, SEED_ROOT, seedFingerprint } from './seed';

export type Db = PGlite;
export type Tx = Parameters<Parameters<PGlite['transaction']>[0]>[0];
export type Queryable = Pick<PGlite, 'query'> | Tx;

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(here, '../db/schema.sql');

/** dataDir = null -> in-memory database (tests). */
export async function openDatabase(dataDir: string | null, log?: (msg: string) => void): Promise<Db> {
  let db: PGlite;
  if (dataDir) {
    mkdirSync(dataDir, { recursive: true });
    db = new PGlite(path.join(dataDir, 'pgdata'));
  } else {
    db = new PGlite();
  }
  await db.waitReady;
  await db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  const seed = await seedQuestions(db);
  log?.(
    seed.skipped
      ? `question bank unchanged (${seed.total} questions), seeding skipped`
      : `question bank loaded: ${seed.total} questions, ${seed.inserted} new`,
  );
  await recoverAfterRestart(db);
  return db;
}

export interface SeedOutcome {
  /** true when the seed files match what was loaded last time */
  skipped: boolean;
  total: number;
  inserted: number;
}

const SEED_BATCH = 200;
const SEED_COLUMNS = 9;

/**
 * Upserts every seed question in batches. Existing rows are updated in place (ids stay stable,
 * so match history keeps pointing at them); questions removed from the files are left untouched.
 */
export async function seedQuestions(db: Db, root = SEED_ROOT): Promise<SeedOutcome> {
  const fingerprint = seedFingerprint(root);
  const state = await db.query<{ fingerprint: string; question_count: number }>(
    'select fingerprint, question_count from seed_state where id = 1',
  );
  if (state.rows[0]?.fingerprint === fingerprint) {
    return { skipped: true, total: state.rows[0].question_count, inserted: 0 };
  }

  const questions = loadSeedQuestions(root);
  let inserted = 0;
  await db.transaction(async (tx) => {
    for (let start = 0; start < questions.length; start += SEED_BATCH) {
      const batch = questions.slice(start, start + SEED_BATCH);
      const params: unknown[] = [];
      const tuples = batch.map((q, i) => {
        params.push(q.category, q.difficulty, q.question, JSON.stringify(q.options), q.correctIndex, q.explanation, q.tradition, q.validAsOf, q.source);
        const p = (k: number) => `$${i * SEED_COLUMNS + k}`;
        return `(${p(1)},${p(2)},${p(3)},${p(4)}::jsonb,${p(5)},${p(6)},${p(7)},${p(8)}::date,${p(9)})`;
      });
      const res = await tx.query<{ inserted: boolean }>(
        `insert into questions (category, difficulty, question, options, correct_index, explanation, tradition, valid_as_of, source)
         values ${tuples.join(',')}
         on conflict (question) do update set
           category = excluded.category, difficulty = excluded.difficulty, options = excluded.options,
           correct_index = excluded.correct_index, explanation = excluded.explanation,
           tradition = excluded.tradition, valid_as_of = excluded.valid_as_of, source = excluded.source
         returning (xmax = 0) as inserted`,
        params,
      );
      inserted += res.rows.filter((r) => r.inserted).length;
    }
    await tx.query(
      `insert into seed_state (id, fingerprint, question_count) values (1, $1, $2)
       on conflict (id) do update set fingerprint = excluded.fingerprint, question_count = excluded.question_count, seeded_at = now()`,
      [fingerprint, questions.length],
    );
  });
  return { skipped: false, total: questions.length, inserted };
}

/** Live match timers live in process memory; a restart cannot resume them, so close them cleanly. */
async function recoverAfterRestart(db: Db) {
  await db.exec(`
    update matches set status = 'abandoned', finished_at = now() where status = 'in_progress';
    update room_players set left_at = now() where left_at is null
      and room_id in (select id from rooms where closed_at is null);
    update rooms set status = 'closed', closed_at = now() where closed_at is null;
  `);
}
