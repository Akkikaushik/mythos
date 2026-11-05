import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeQuestionText } from '../server/src/seed';
import { csvToQuestions, decodeHtml, OPENTDB_SOURCE, openTdbToQuestions, parseCsv, removeDuplicates } from '../scripts/lib/importers';

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

describe('parseCsv', () => {
  it('handles quotes, embedded commas, newlines, doubled quotes, CRLF and a BOM', () => {
    const text = '\uFEFFa,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n\r\nplain,,end\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line1\nline2'],
      ['plain', '', 'end'],
    ]);
  });

  it('rejects an unterminated quoted field', () => {
    expect(() => parseCsv('a,"open\n')).toThrow(/quoted field/);
  });
});

describe('CSV import', () => {
  const result = csvToQuestions(fixture('import-sample.csv'), { src: 'Test pack' });

  it('accepts valid rows, including quoted text and category labels', () => {
    expect(result.questions.map((q) => q.q)).toEqual([
      'Who wrote the novel "Things Fall Apart"?',
      'In Greek mythology, who is the goddess of wisdom, warfare and crafts?',
      'What is the capital city of Australia?',
    ]);
    const [novel, myth] = result.questions;
    expect(novel).toMatchObject({ c: 'literature', a: 'Chinua Achebe', t: null, src: 'Test pack' });
    expect(novel.e).toBe('Chinua Achebe published it in 1958, in London.');
    expect(myth).toMatchObject({ c: 'world_mythology', t: 'Greek' });
  });

  it('reports invalid rows with their row number and reason', () => {
    expect(result.rejected.map((r) => [r.row, r.reason])).toEqual([
      [5, 'current-affairs questions need asOf date'],
      [6, 'options must be distinct'],
      [7, 'unknown category cooking'],
    ]);
  });

  it('drops questions already in the bank', () => {
    const existing = new Set([normalizeQuestionText('What is the capital city of Australia?')]);
    const deduped = removeDuplicates(result, existing);
    expect(deduped.questions).toHaveLength(2);
    expect(deduped.rejected.find((r) => r.row === 4)?.reason).toBe('duplicate of a question already in the bank');
  });

  it('refuses a CSV without the required columns', () => {
    expect(() => csvToQuestions('category,question\nscience,Hi?\n')).toThrow(/missing column\(s\): difficulty, answer/);
  });
});

describe('decodeHtml', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeHtml('&quot;Pok&eacute;mon&quot; &amp; &#039;Zelda&#039; &#x2014; caf&eacute;')).toBe('"Pokémon" & \'Zelda\' — café');
  });

  it('throws on entities it does not know', () => {
    expect(() => decodeHtml('a &madeup; b')).toThrow(/unknown HTML entity &madeup;/);
  });
});

describe('Open Trivia DB import', () => {
  const result = openTdbToQuestions(JSON.parse(fixture('opentdb-sample.json')), { importedOn: '2026-11-06' });

  it('maps categories, decodes text and records the licence', () => {
    expect(result.questions.map((q) => [q.c, q.q])).toEqual([
      ['technology', 'What does the "S" in "HTTPS" stand for?'],
      ['anime', 'In "Pokémon", which type is Pikachu?'],
      ['politics', 'How many permanent members does the UN Security Council have?'],
    ]);
    for (const q of result.questions) {
      expect(q.src).toBe(OPENTDB_SOURCE);
      expect(q.e).toBe(`The correct answer is ${q.a}. Source: Open Trivia DB.`);
    }
    expect(result.questions[2].asOf).toBe('2026-11-06');
    expect(result.questions[0].asOf).toBeUndefined();
  });

  it('skips true/false questions, unmapped categories and unknown entities', () => {
    expect(result.rejected.map((r) => [r.row, r.reason])).toEqual([
      [2, 'only multiple-choice questions are imported'],
      [3, 'category "Art" is not mapped'],
      [6, 'unknown HTML entity &unknownentity;'],
    ]);
  });

  it('accepts a bare array of results and rejects other shapes', () => {
    expect(openTdbToQuestions([], { importedOn: '2026-11-06' }).questions).toEqual([]);
    expect(() => openTdbToQuestions({ nope: true }, { importedOn: '2026-11-06' })).toThrow(/Open Trivia DB response/);
  });
});
