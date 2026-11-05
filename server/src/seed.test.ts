import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSeedQuestions, QUESTIONS_PATH, validateRawQuestion, type RawQuestion } from './seed';
import { CATEGORY_IDS } from '../../shared/rules';

describe('seed question bank', () => {
  const raw = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8')) as RawQuestion[];
  const qs = loadSeedQuestions();

  it('has at least 100 valid, unique questions', () => {
    expect(qs.length).toBeGreaterThanOrEqual(100);
    for (const r of raw) expect(validateRawQuestion(r), r.q).toBeNull();
    expect(new Set(qs.map((q) => q.question)).size).toBe(qs.length);
  });

  it('covers every category with all three difficulties', () => {
    for (const c of CATEGORY_IDS) {
      const inCat = qs.filter((q) => q.category === c);
      expect(inCat.length, c).toBeGreaterThanOrEqual(8);
      expect(new Set(inCat.map((q) => q.difficulty)).size, c).toBe(3);
    }
  });

  it('keeps the correct option intact and spreads answer positions', () => {
    for (const r of raw) {
      const q = qs.find((x) => x.question === r.q)!;
      expect(q.options[q.correctIndex]).toBe(r.a);
      expect(q.options).toHaveLength(4);
    }
    const positions = new Set(qs.map((q) => q.correctIndex));
    expect(positions.size).toBe(4);
  });

  it('dates every current-affairs question', () => {
    for (const q of qs.filter((x) => x.category === 'politics')) expect(q.validAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
