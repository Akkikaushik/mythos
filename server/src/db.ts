import { PGlite } from '@electric-sql/pglite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSeedQuestions } from './seed';

export type Db = PGlite;
export type Tx = Parameters<Parameters<PGlite['transaction']>[0]>[0];
export type Queryable = Pick<PGlite, 'query'> | Tx;

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(here, '../db/schema.sql');

/** dataDir = null -> in-memory database (tests). */
export async function openDatabase(dataDir: string | null): Promise<Db> {
  let db: PGlite;
  if (dataDir) {
    mkdirSync(dataDir, { recursive: true });
    db = new PGlite(path.join(dataDir, 'pgdata'));
  } else {
    db = new PGlite();
  }
  await db.waitReady;
  await db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  await seedQuestions(db);
  await recoverAfterRestart(db);
  return db;
}

export async function seedQuestions(db: Db): Promise<number> {
  const questions = loadSeedQuestions();
  let inserted = 0;
  await db.transaction(async (tx) => {
    for (const q of questions) {
      const res = await tx.query(
        `insert into questions (category, difficulty, question, options, correct_index, explanation, tradition, valid_as_of)
         values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)
         on conflict (question) do nothing`,
        [q.category, q.difficulty, q.question, JSON.stringify(q.options), q.correctIndex, q.explanation, q.tradition, q.validAsOf],
      );
      inserted += res.affectedRows ?? 0;
    }
  });
  return inserted;
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
