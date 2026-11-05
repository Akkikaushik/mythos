import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  collectSeedQuestions,
  listSeedFiles,
  loadSeedQuestions,
  normalizeQuestionText,
  readRawFile,
  seedFingerprint,
  validateRawQuestion,
  type RawQuestion,
} from './seed';
import { CATEGORY_IDS } from '../../shared/rules';

describe('seed question bank', () => {
  const { questions: qs, issues } = collectSeedQuestions();
  const raw = listSeedFiles().flatMap((f) => readRawFile(f));

  it('has at least 100 valid, unique questions and no problems', () => {
    expect(issues).toEqual([]);
    expect(qs.length).toBeGreaterThanOrEqual(100);
    for (const r of raw) expect(validateRawQuestion(r), r.q).toBeNull();
    expect(new Set(qs.map((q) => normalizeQuestionText(q.question))).size).toBe(qs.length);
  });

  it('covers every category with all three difficulties', () => {
    for (const c of CATEGORY_IDS) {
      const inCat = qs.filter((q) => q.category === c);
      expect(inCat.length, c).toBeGreaterThanOrEqual(8);
      expect(new Set(inCat.map((q) => q.difficulty)).size, c).toBe(3);
    }
  });

  it('keeps the correct option intact and spreads answer positions', () => {
    const byText = new Map(qs.map((q) => [q.question, q]));
    for (const r of raw) {
      const q = byText.get(r.q)!;
      expect(q.options[q.correctIndex]).toBe(r.a);
      expect(q.options).toHaveLength(4);
    }
    expect(new Set(qs.map((q) => q.correctIndex)).size).toBe(4);
  });

  it('dates every current-affairs question', () => {
    for (const q of qs.filter((x) => x.category === 'politics')) expect(q.validAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('seed loader', () => {
  let root: string;
  const q = (over: Partial<RawQuestion> = {}): RawQuestion => ({
    c: 'science',
    d: 'easy',
    q: 'Which planet is closest to the Sun?',
    a: 'Mercury',
    w: ['Venus', 'Mars', 'Earth'],
    e: 'Mercury orbits closest to the Sun.',
    t: null,
    ...over,
  });
  const write = (rel: string, data: unknown) => {
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
  };

  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const fresh = () => (root = mkdtempSync(path.join(tmpdir(), 'mythos-seed-')));

  it('loads every file from questions, generated and imported', () => {
    fresh();
    write('questions/science.json', [q()]);
    write('generated/maths.json', [q({ c: 'mathematics', q: 'What is 2 + 2 in base ten?', a: '4', w: ['3', '5', '22'] })]);
    write('imported/pack.json', [q({ c: 'literature', q: 'Who wrote "Hamlet"?', a: 'William Shakespeare', w: ['Marlowe', 'Jonson', 'Kyd'], src: 'Test pack' })]);
    write('data/ignored.json', [q({ q: 'This file is a dataset, not questions' })]);
    const loaded = loadSeedQuestions(root);
    expect(loaded.map((x) => x.category).sort()).toEqual(['literature', 'mathematics', 'science']);
    expect(loaded.find((x) => x.category === 'literature')!.source).toBe('Test pack');
    expect(loaded.find((x) => x.category === 'science')!.source).toBeNull();
  });

  it('rejects duplicates across files after normalising case, accents and punctuation', () => {
    fresh();
    write('questions/a.json', [q()]);
    write('imported/b.json', [q({ q: '  which PLANET is closest to the sun ' })]);
    const { questions, issues } = collectSeedQuestions(root);
    expect(questions).toHaveLength(1);
    expect(issues).toEqual([{ file: 'imported/b.json', question: '  which PLANET is closest to the sun ', error: 'duplicate of a question in questions/a.json' }]);
    expect(() => loadSeedQuestions(root)).toThrow(/imported\/b\.json: duplicate/);
    expect(normalizeQuestionText('Pokémon: “Who’s that?”')).toBe(normalizeQuestionText('pokemon who s that'));
  });

  it('reports invalid questions and unreadable files with the file name', () => {
    fresh();
    write('questions/bad.json', [q({ w: ['Venus', 'Venus', 'Mars'] }), q({ q: 'Who is the current UN Secretary-General?', c: 'politics', a: 'X', w: ['A', 'B', 'C'] })]);
    write('imported/broken.json', '{ not json');
    write('imported/object.json', { q: 'not an array' });
    const { issues } = collectSeedQuestions(root);
    expect(issues.map((i) => `${i.file}: ${i.error}`)).toEqual([
      'questions/bad.json: options must be distinct',
      'questions/bad.json: current-affairs questions need asOf date',
      'imported/broken.json: ' + issues[2].error,
      'imported/object.json: file must contain a JSON array',
    ]);
  });

  it('changes the fingerprint when any seed file changes', () => {
    fresh();
    write('questions/a.json', [q()]);
    const first = seedFingerprint(root);
    expect(seedFingerprint(root)).toBe(first);
    write('questions/a.json', [q({ e: 'Edited explanation.' })]);
    expect(seedFingerprint(root)).not.toBe(first);
    const second = seedFingerprint(root);
    write('imported/new.json', []);
    expect(seedFingerprint(root)).not.toBe(second);
  });
});
