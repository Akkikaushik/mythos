import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase, type Db } from '../server/src/db';
import { categoryQuotas, pickQuestions } from '../server/src/repo';
import { CATEGORY_IDS, DEFAULT_SETTINGS, type GameSettings } from '../shared/rules';

const settings = (over: Partial<GameSettings>): GameSettings => ({ ...DEFAULT_SETTINGS, ...over });

describe('categoryQuotas', () => {
  it('splits questions as evenly as possible', () => {
    const q = categoryQuotas(['a', 'b', 'c'], 10);
    expect([...q.values()].sort()).toEqual([3, 3, 4]);
    expect(categoryQuotas(CATEGORY_IDS, 10).size).toBe(10);
  });
});

describe('pickQuestions', () => {
  let db: Db;
  beforeAll(async () => {
    db = await openDatabase(null);
  });
  afterAll(async () => {
    await db.close();
  });

  it('spreads a Mixed match across categories even though some are much larger', async () => {
    const counts = await db.query<{ category: string; n: number }>('select category, count(*)::int as n from questions group by category');
    const sizes = counts.rows.map((r) => r.n);
    expect(Math.max(...sizes)).toBeGreaterThan(10 * Math.min(...sizes));

    for (let run = 0; run < 5; run++) {
      const picked = await pickQuestions(db, settings({ categories: ['mixed'], difficulty: 'mixed', questionCount: 13 }));
      expect(picked).toHaveLength(13);
      expect(new Set(picked.map((p) => p.category)).size).toBe(13);
    }
  });

  it('splits evenly between the chosen categories', async () => {
    const picked = await pickQuestions(db, settings({ categories: ['geography', 'anime'], difficulty: 'mixed', questionCount: 10 }));
    const geo = picked.filter((p) => p.category === 'geography').length;
    expect(picked).toHaveLength(10);
    expect(geo).toBe(5);
    expect(new Set(picked.map((p) => p.id)).size).toBe(10);
  });

  it('honours difficulty first, then tops up a small category so the match is full', async () => {
    const hardAnime = await db.query<{ n: number }>(`select count(*)::int as n from questions where category = 'anime' and difficulty = 'hard'`);
    const allAnime = await db.query<{ n: number }>(`select count(*)::int as n from questions where category = 'anime'`);
    const picked = await pickQuestions(db, settings({ categories: ['anime'], difficulty: 'hard', questionCount: 15 }));
    expect(picked).toHaveLength(15);
    expect(new Set(picked.map((p) => p.id)).size).toBe(15);
    expect(picked.filter((p) => p.category === 'anime' && p.difficulty === 'hard')).toHaveLength(hardAnime.rows[0].n);
    expect(picked.filter((p) => p.category === 'anime')).toHaveLength(Math.min(15, allAnime.rows[0].n));
  });
});

describe('seeding on startup', () => {
  it('loads the bank once and skips it on the next start when files are unchanged', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mythos-db-'));
    try {
      const logs: string[] = [];
      const first = await openDatabase(dir, (m) => logs.push(m));
      const total = (await first.query<{ n: number }>('select count(*)::int as n from questions')).rows[0].n;
      const source = await first.query<{ n: number }>(`select count(*)::int as n from information_schema.columns where table_name = 'questions' and column_name = 'source'`);
      await first.close();
      expect(source.rows[0].n).toBe(1);
      expect(logs[0]).toBe(`question bank loaded: ${total} questions, ${total} new`);

      const second = await openDatabase(dir, (m) => logs.push(m));
      const after = (await second.query<{ n: number }>('select count(*)::int as n from questions')).rows[0].n;
      await second.close();
      expect(after).toBe(total);
      expect(logs[1]).toBe(`question bank unchanged (${total} questions), seeding skipped`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
