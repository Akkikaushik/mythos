import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readRawFile, SEED_ROOT, validateRawQuestion, type RawQuestion } from '../server/src/seed';
import { existingQuestionKeys } from '../scripts/lib/bank-files';
import {
  CONTINENTS,
  countryLabel,
  generateGeography,
  generateMaths,
  generateScience,
  MAX_ELEMENT,
  mulberry32,
  type Country,
  type Element,
} from '../scripts/lib/generators';

const data = <T>(name: string) => JSON.parse(readFileSync(path.join(SEED_ROOT, 'data', name), 'utf8')) as T;
const countries = data<Country[]>('countries.json');
const elements = data<Element[]>('elements.json');
const generated = (name: string) => readRawFile(path.join(SEED_ROOT, 'generated', name));
const geo = generated('geography.json');
const sci = generated('science.json');
const maths = generated('mathematics.json');

function expectWellFormed(qs: RawQuestion[]) {
  for (const q of qs) {
    expect(validateRawQuestion(q), q.q).toBeNull();
    expect(q.w, q.q).not.toContain(q.a);
  }
}

describe('generated question files', () => {
  it('are deterministic and in sync with the generator', () => {
    const generatedDir = path.join(SEED_ROOT, 'generated') + path.sep;
    const run = () => {
      const taken = existingQuestionKeys((f) => f.startsWith(generatedDir));
      return {
        geo: generateGeography(countries, mulberry32(1001), taken),
        sci: generateScience(elements, mulberry32(2002), taken),
        maths: generateMaths(mulberry32(3003), taken),
      };
    };
    const a = run();
    expect(run()).toEqual(a);
    expect(a.geo).toEqual(geo);
    expect(a.sci).toEqual(sci);
    expect(a.maths).toEqual(maths);
  });

  it('only contain valid questions with distinct, wrong distractors', () => {
    expectWellFormed([...geo, ...sci, ...maths]);
    expect(geo.length + sci.length + maths.length).toBeGreaterThanOrEqual(1000);
  });
});

describe('geography answers match the dataset', () => {
  const byLabel = new Map(countries.map((c) => [countryLabel(c), c]));
  const byName = new Map(countries.map((c) => [c.name, c]));
  const byCapital = new Map(countries.map((c) => [c.capital, c]));

  it('every question maps to its dataset row', () => {
    for (const q of geo) {
      let m: RegExpMatchArray | null;
      if ((m = q.q.match(/^What is the capital city of (.+)\?$/))) {
        const c = byLabel.get(m[1])!;
        expect(q.a, q.q).toBe(c.capital);
        for (const w of q.w) expect(byCapital.get(w), w).toBeDefined();
      } else if ((m = q.q.match(/^(.+) is the capital city of which country\?$/))) {
        expect(byName.get(q.a)?.capital, q.q).toBe(m[1]);
        for (const w of q.w) expect(byName.get(w)?.capital, w).not.toBe(m[1]);
      } else if ((m = q.q.match(/^On which continent is (.+) located\?$/))) {
        const c = byLabel.get(m[1])!;
        expect(c.transcontinental, q.q).toBeFalsy();
        expect(q.a, q.q).toBe(c.continent);
        for (const w of q.w) expect(CONTINENTS).toContain(w);
      } else if ((m = q.q.match(/^What is the official currency of (.+)\?$/))) {
        const c = byLabel.get(m[1])!;
        expect(q.a, q.q).toBe(c.currency);
        expect(q.w).not.toContain('US dollar');
      } else {
        throw new Error(`unrecognised geography question: ${q.q}`);
      }
    }
  });
});

describe('science answers match the dataset', () => {
  const byLowerName = new Map(elements.map((e) => [e.name.toLowerCase(), e]));
  const bySymbol = new Map(elements.map((e) => [e.symbol, e]));

  it('every question maps to its element', () => {
    for (const q of sci) {
      let m: RegExpMatchArray | null;
      if ((m = q.q.match(/^What is the chemical symbol for (.+)\?$/))) {
        const el = byLowerName.get(m[1])!;
        expect(q.a, q.q).toBe(el.symbol);
        for (const w of q.w) expect(bySymbol.get(w), w).toBeDefined();
      } else if ((m = q.q.match(/^Which element has the chemical symbol (\w+)\?$/))) {
        expect(q.a, q.q).toBe(bySymbol.get(m[1])!.name);
        for (const w of q.w) expect(byLowerName.get(w.toLowerCase()), w).toBeDefined();
      } else if ((m = q.q.match(/^What is the atomic number of (.+)\?$/))) {
        expect(q.a, q.q).toBe(String(byLowerName.get(m[1])!.n));
      } else {
        throw new Error(`unrecognised science question: ${q.q}`);
      }
    }
    const asked = new Set(sci.map((q) => q.a));
    for (const e of elements.filter((x) => x.n > MAX_ELEMENT)) expect(asked.has(e.name)).toBe(false);
  });
});

describe('maths answers match an independent recomputation', () => {
  const gcd = (a: number, b: number): number => {
    while (b) [a, b] = [b, a % b];
    return a;
  };
  const prime = (n: number) => n > 1 && Array.from({ length: Math.floor(Math.sqrt(n)) - 1 }, (_, i) => i + 2).every((d) => n % d !== 0);

  const solve = (q: string): { answer: number; check?: (w: number) => boolean } => {
    let m: RegExpMatchArray | null;
    const n = (i: number) => Number(m![i]);
    if ((m = q.match(/^What is (\d+) \+ (\d+)\?$/))) return { answer: n(1) + n(2) };
    if ((m = q.match(/^What is (\d+) − (\d+)\?$/))) return { answer: n(1) - n(2) };
    if ((m = q.match(/^What is (\d+) × (\d+)\?$/))) return { answer: n(1) * n(2) };
    if ((m = q.match(/^What is (\d+) ÷ (\d+)\?$/))) {
      expect(n(1) % n(2)).toBe(0);
      return { answer: n(1) / n(2) };
    }
    if ((m = q.match(/^What is (\d+)% of (\d+)\?$/))) return { answer: (n(1) * n(2)) / 100 };
    if ((m = q.match(/^What is (\d+)²\?$/))) return { answer: n(1) ** 2 };
    if ((m = q.match(/^What is (\d+)³\?$/))) return { answer: n(1) ** 3 };
    if ((m = q.match(/^What is the square root of (\d+)\?$/))) return { answer: Math.sqrt(n(1)) };
    if ((m = q.match(/^If (\d+)x \+ (\d+) = (\d+), what is the value of x\?$/))) return { answer: (n(3) - n(2)) / n(1) };
    if ((m = q.match(/^What is the highest common factor \(HCF\) of (\d+) and (\d+)\?$/))) return { answer: gcd(n(1), n(2)) };
    if ((m = q.match(/^What is the lowest common multiple \(LCM\) of (\d+) and (\d+)\?$/))) return { answer: (n(1) * n(2)) / gcd(n(1), n(2)) };
    if ((m = q.match(/^Which of these numbers is prime: (\d+), (\d+), (\d+) or (\d+)\?$/))) {
      const listed = [n(1), n(2), n(3), n(4)];
      const primes = listed.filter(prime);
      expect(primes, q).toHaveLength(1);
      return { answer: primes[0], check: (w) => listed.includes(w) && !prime(w) };
    }
    throw new Error(`unrecognised maths question: ${q}`);
  };

  it('every answer is correct and every wrong option is wrong', () => {
    for (const q of maths) {
      const { answer, check } = solve(q.q);
      expect(Number.isInteger(answer), q.q).toBe(true);
      expect(q.a, q.q).toBe(String(answer));
      for (const w of q.w) {
        expect(Number(w), `${q.q} wrong ${w}`).not.toBe(answer);
        expect(Number(w), `${q.q} wrong ${w}`).toBeGreaterThan(0);
        if (check) expect(check(Number(w)), `${q.q} wrong ${w}`).toBe(true);
      }
    }
  });
});

describe('mulberry32', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    for (const v of seqA) expect(v >= 0 && v < 1).toBe(true);
  });
});
