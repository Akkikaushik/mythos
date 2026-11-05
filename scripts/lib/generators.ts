// Builds questions from datasets and arithmetic so every answer is correct by construction.
// Pure functions: the same seed and data always produce the same questions.
import { normalizeQuestionText, type RawQuestion } from '../../server/src/seed';
import type { Difficulty } from '../../shared/rules';

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Up to `n` distinct values, taken from `preferred` first, never equal to `answer` (case-insensitive). */
export function pickWrong(rng: Rng, answer: string, preferred: readonly string[], fallback: readonly string[] = [], n = 3): string[] {
  const taken = new Set([answer.trim().toLowerCase()]);
  const out: string[] = [];
  for (const pool of [preferred, fallback]) {
    for (const v of shuffle(rng, pool)) {
      const k = v.trim().toLowerCase();
      if (taken.has(k)) continue;
      taken.add(k);
      out.push(v);
      if (out.length === n) return out;
    }
  }
  throw new Error(`not enough wrong options for "${answer}"`);
}

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
const ucfirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Collects questions, skipping any whose text already exists elsewhere in the bank. */
class Bank {
  readonly items: RawQuestion[] = [];
  constructor(private readonly taken: Set<string>) {}
  add(q: RawQuestion): boolean {
    const key = normalizeQuestionText(q.q);
    if (this.taken.has(key)) return false;
    this.taken.add(key);
    this.items.push(q);
    return true;
  }
}

// ---------------------------------------------------------------- geography

export interface Country {
  name: string;
  /** used in question text when the plain name is ambiguous */
  label?: string;
  /** name takes "the" in a sentence, e.g. "the United Kingdom" */
  the?: boolean;
  capital: string;
  continent: string;
  /** null when the answer would be ambiguous (shared or multiple legal currencies) */
  currency: string | null;
  tier: 1 | 2 | 3;
  /** spans two continents, so no continent question is asked */
  transcontinental?: boolean;
}

export const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'] as const;
const TIER: Record<1 | 2 | 3, Difficulty> = { 1: 'easy', 2: 'medium', 3: 'hard' };

export const countryLabel = (c: Country) => c.label ?? (c.the ? `the ${c.name}` : c.name);

export function generateGeography(countries: Country[], rng: Rng, taken: Set<string>): RawQuestion[] {
  const bank = new Bank(taken);
  const sameContinent = (c: Country) => countries.filter((o) => o !== c && o.continent === c.continent);
  const others = (c: Country) => countries.filter((o) => o !== c);

  for (const c of countries) {
    const label = countryLabel(c);
    bank.add({
      c: 'geography',
      d: TIER[c.tier],
      q: `What is the capital city of ${label}?`,
      a: c.capital,
      w: pickWrong(rng, c.capital, sameContinent(c).map((o) => o.capital), others(c).map((o) => o.capital)),
      e: sentence(`The capital of ${label} is ${c.capital}`),
      t: null,
    });
  }

  for (const c of countries) {
    if (c.capital.toLowerCase().includes(c.name.toLowerCase())) continue;
    bank.add({
      c: 'geography',
      d: TIER[c.tier],
      q: `${c.capital} is the capital city of which country?`,
      a: c.name,
      w: pickWrong(rng, c.name, sameContinent(c).map((o) => o.name), others(c).map((o) => o.name)),
      e: sentence(`${c.capital} is the capital of ${countryLabel(c)}`),
      t: null,
    });
  }

  for (const c of countries) {
    if (c.transcontinental) continue;
    bank.add({
      c: 'geography',
      d: c.tier === 3 ? 'medium' : 'easy',
      q: `On which continent is ${countryLabel(c)} located?`,
      a: c.continent,
      w: pickWrong(rng, c.continent, CONTINENTS),
      e: sentence(`${ucfirst(countryLabel(c))} is in ${c.continent}`),
      t: null,
    });
  }

  for (const c of countries) {
    if (!c.currency) continue;
    // US dollars circulate widely across the Americas, so they would make a misleading wrong option
    const cur = (list: Country[]) =>
      list.map((o) => o.currency).filter((v): v is string => !!v && v !== 'US dollar');
    bank.add({
      c: 'geography',
      d: TIER[c.tier],
      q: `What is the official currency of ${countryLabel(c)}?`,
      a: c.currency,
      w: pickWrong(rng, c.currency, cur(sameContinent(c)), cur(others(c))),
      e: sentence(`${ucfirst(countryLabel(c))} uses the ${c.currency} as its official currency`),
      t: null,
    });
  }

  return bank.items;
}

// ---------------------------------------------------------------- science

export interface Element {
  n: number;
  symbol: string;
  name: string;
}

/** Questions cover elements up to plutonium; heavier ones are synthetic and short-lived. */
export const MAX_ELEMENT = 94;
const FAMOUS_ELEMENTS = new Set([26, 29, 30, 47, 50, 53, 78, 79, 80, 82, 92]);
const SYMBOL_ORIGIN: Record<string, string> = {
  Na: 'Latin natrium',
  K: 'Latin kalium',
  Fe: 'Latin ferrum',
  Cu: 'Latin cuprum',
  Ag: 'Latin argentum',
  Sn: 'Latin stannum',
  Sb: 'Latin stibium',
  Au: 'Latin aurum',
  Hg: 'Latin hydrargyrum',
  Pb: 'Latin plumbum',
  W: 'wolfram, its German name',
};

const elementDifficulty = (e: Element): Difficulty =>
  e.n <= 20 || FAMOUS_ELEMENTS.has(e.n) ? 'easy' : e.n <= 56 ? 'medium' : 'hard';

export function generateScience(elements: Element[], rng: Rng, taken: Set<string>): RawQuestion[] {
  const bank = new Bank(taken);
  const asked = elements.filter((e) => e.n <= MAX_ELEMENT);
  const allSymbols = elements.map((e) => e.symbol);

  for (const el of asked) {
    const similar = allSymbols.filter((s) => s[0] === el.symbol[0] || s[0] === el.name[0]);
    const origin = SYMBOL_ORIGIN[el.symbol];
    bank.add({
      c: 'science',
      d: elementDifficulty(el),
      q: `What is the chemical symbol for ${el.name.toLowerCase()}?`,
      a: el.symbol,
      w: pickWrong(rng, el.symbol, similar, allSymbols),
      e: sentence(`The symbol for ${el.name.toLowerCase()} is ${el.symbol}${origin ? `, from ${origin}` : ''}`),
      t: null,
    });
  }

  for (const el of asked) {
    const names = asked.map((e) => e.name);
    const similar = names.filter((n) => n[0] === el.symbol[0]);
    bank.add({
      c: 'science',
      d: elementDifficulty(el),
      q: `Which element has the chemical symbol ${el.symbol}?`,
      a: el.name,
      w: pickWrong(rng, el.name, similar, names),
      e: sentence(`${el.symbol} is the symbol for ${el.name.toLowerCase()}, element number ${el.n}`),
      t: null,
    });
  }

  for (const el of asked) {
    if (el.n > 36 && !FAMOUS_ELEMENTS.has(el.n)) continue;
    const near = [-3, -2, -1, 1, 2, 3, 10].map((d) => el.n + d).filter((v) => v >= 1).map(String);
    bank.add({
      c: 'science',
      d: el.n === 1 ? 'easy' : el.n <= 8 ? 'medium' : 'hard',
      q: `What is the atomic number of ${el.name.toLowerCase()}?`,
      a: String(el.n),
      w: pickWrong(rng, String(el.n), near),
      e: sentence(`${el.name} has ${el.n} proton${el.n === 1 ? '' : 's'} in its nucleus, so its atomic number is ${el.n}`),
      t: null,
    });
  }

  return bank.items;
}

// ---------------------------------------------------------------- mathematics

export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
export const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;
export const isPrime = (n: number) => {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
};
const smallestFactor = (n: number) => {
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return i;
  return n;
};

/** Wrong numeric answers near the real one, as text. */
function numericWrong(rng: Rng, answer: number, candidates: number[]): string[] {
  const near = candidates.filter((v) => Number.isInteger(v) && v > 0 && v !== answer).map(String);
  const spread = [1, 2, 3, 5, 10].flatMap((d) => [answer + d, answer - d]).filter((v) => v > 0).map(String);
  return pickWrong(rng, String(answer), near, spread);
}

interface MathTemplate {
  count: number;
  difficulty: Difficulty;
  make: (rng: Rng) => { q: string; a: number | string; w: string[]; e: string } | null;
}

const MATH_TEMPLATES: MathTemplate[] = [
  {
    count: 30,
    difficulty: 'easy',
    make: (rng) => {
      const a = int(rng, 12, 99);
      const b = int(rng, 12, 99);
      const s = a + b;
      return { q: `What is ${a} + ${b}?`, a: s, w: numericWrong(rng, s, [s + 10, s - 10, s + 1, s - 1]), e: `${a} + ${b} = ${s}.` };
    },
  },
  {
    count: 30,
    difficulty: 'easy',
    make: (rng) => {
      const a = int(rng, 50, 199);
      const b = int(rng, 11, a - 10);
      const d = a - b;
      return { q: `What is ${a} − ${b}?`, a: d, w: numericWrong(rng, d, [d + 10, d - 10, d + 1, d - 1]), e: `${a} − ${b} = ${d}.` };
    },
  },
  {
    count: 30,
    difficulty: 'easy',
    make: (rng) => {
      const a = int(rng, 3, 12);
      const b = int(rng, 3, 12);
      const p = a * b;
      return { q: `What is ${a} × ${b}?`, a: p, w: numericWrong(rng, p, [p + a, p - a, p + b, p - b]), e: `${a} × ${b} = ${p}.` };
    },
  },
  {
    count: 30,
    difficulty: 'medium',
    make: (rng) => {
      const a = int(rng, 13, 49);
      const b = int(rng, 11, 29);
      const p = a * b;
      return { q: `What is ${a} × ${b}?`, a: p, w: numericWrong(rng, p, [p + 10, p - 10, p + a, p - b]), e: `${a} × ${b} = ${p}.` };
    },
  },
  {
    count: 30,
    difficulty: 'medium',
    make: (rng) => {
      const b = int(rng, 3, 12);
      const q = int(rng, 6, 25);
      const a = b * q;
      return { q: `What is ${a} ÷ ${b}?`, a: q, w: numericWrong(rng, q, [q + 1, q - 1, q + 2, q - 2]), e: `${a} ÷ ${b} = ${q}, because ${b} × ${q} = ${a}.` };
    },
  },
  {
    count: 30,
    difficulty: 'medium',
    make: (rng) => {
      const p = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 80][int(rng, 0, 12)];
      const n = 20 * int(rng, 2, 40);
      const r = (p * n) / 100;
      return {
        q: `What is ${p}% of ${n}?`,
        a: r,
        w: numericWrong(rng, r, [r * 2, r / 2, r + 10, r - 10, (p * n) / 10]),
        e: `${p}% of ${n} = ${p}/100 × ${n} = ${r}.`,
      };
    },
  },
  {
    count: 18,
    difficulty: 'medium',
    make: (rng) => {
      const n = int(rng, 13, 30);
      const s = n * n;
      return { q: `What is ${n}²?`, a: s, w: numericWrong(rng, s, [s + n, s - n, (n + 1) ** 2, (n - 1) ** 2, 2 * n]), e: `${n}² = ${n} × ${n} = ${s}.` };
    },
  },
  {
    count: 19,
    difficulty: 'medium',
    make: (rng) => {
      const n = int(rng, 11, 30);
      return { q: `What is the square root of ${n * n}?`, a: n, w: numericWrong(rng, n, [n + 1, n - 1, n + 2, n - 2]), e: `${n} × ${n} = ${n * n}, so the square root of ${n * n} is ${n}.` };
    },
  },
  {
    count: 30,
    difficulty: 'medium',
    make: (rng) => {
      const x = int(rng, 2, 20);
      const a = int(rng, 2, 9);
      const b = int(rng, 1, 30);
      const c = a * x + b;
      return {
        q: `If ${a}x + ${b} = ${c}, what is the value of x?`,
        a: x,
        w: numericWrong(rng, x, [x + 1, x - 1, x + 2, Math.round((c + b) / a)]),
        e: `${a}x = ${c} − ${b} = ${c - b}, so x = ${c - b} ÷ ${a} = ${x}.`,
      };
    },
  },
  {
    count: 25,
    difficulty: 'hard',
    make: (rng) => {
      const g = int(rng, 4, 18);
      const m = int(rng, 2, 8);
      const n = int(rng, m + 1, 9);
      if (gcd(m, n) !== 1) return null;
      const a = g * m;
      const b = g * n;
      return {
        q: `What is the highest common factor (HCF) of ${a} and ${b}?`,
        a: g,
        w: numericWrong(rng, g, [g * 2, g / 2, g + 1, g - 1, g + 2]),
        e: `${a} = ${g} × ${m} and ${b} = ${g} × ${n}. ${m} and ${n} share no common factor, so the HCF is ${g}.`,
      };
    },
  },
  {
    count: 25,
    difficulty: 'hard',
    make: (rng) => {
      const a = int(rng, 4, 30);
      const b = int(rng, a + 1, 36);
      const g = gcd(a, b);
      if (g === 1 || b % a === 0) return null;
      const l = lcm(a, b);
      return {
        q: `What is the lowest common multiple (LCM) of ${a} and ${b}?`,
        a: l,
        w: numericWrong(rng, l, [a * b, l * 2, l / 2, l + a, l - b]),
        e: `The HCF of ${a} and ${b} is ${g}, so the LCM is ${a} × ${b} ÷ ${g} = ${l}.`,
      };
    },
  },
  {
    count: 25,
    difficulty: 'hard',
    make: (rng) => {
      const p = int(rng, 50, 200);
      if (!isPrime(p)) return null;
      const composites: number[] = [];
      for (let v = p - 40; v <= p + 40; v++) {
        if (v > 1 && v % 2 === 1 && v % 5 !== 0 && !isPrime(v)) composites.push(v);
      }
      if (composites.length < 3) return null;
      const wrong = shuffle(rng, composites).slice(0, 3);
      const listed = [p, ...wrong].sort((x, y) => x - y);
      const factors = wrong
        .sort((x, y) => x - y)
        .map((v) => `${v} = ${smallestFactor(v)} × ${v / smallestFactor(v)}`)
        .join(', ');
      return {
        q: `Which of these numbers is prime: ${listed.slice(0, 3).join(', ')} or ${listed[3]}?`,
        a: p,
        w: wrong.map(String),
        e: `${p} has no divisors other than 1 and itself, while ${factors}.`,
      };
    },
  },
  {
    count: 12,
    difficulty: 'hard',
    make: (rng) => {
      const n = int(rng, 4, 15);
      const c = n ** 3;
      return { q: `What is ${n}³?`, a: c, w: numericWrong(rng, c, [n * n, (n + 1) ** 3, (n - 1) ** 3, 3 * n, c + n]), e: `${n}³ = ${n} × ${n} × ${n} = ${c}.` };
    },
  },
];

export function generateMaths(rng: Rng, taken: Set<string>): RawQuestion[] {
  const bank = new Bank(taken);
  for (const t of MATH_TEMPLATES) {
    let made = 0;
    for (let attempt = 0; made < t.count && attempt < t.count * 50; attempt++) {
      const m = t.make(rng);
      if (!m) continue;
      if (bank.add({ c: 'mathematics', d: t.difficulty, q: m.q, a: String(m.a), w: m.w, e: m.e, t: null })) made++;
    }
  }
  return bank.items;
}
