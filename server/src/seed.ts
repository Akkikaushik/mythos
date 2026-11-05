import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CATEGORY_IDS, DIFFICULTIES, type CategoryId, type Difficulty } from '../../shared/rules';

export interface RawQuestion {
  c: string;
  d: string;
  q: string;
  a: string;
  w: string[];
  e: string;
  t: string | null;
  asOf?: string;
}

export interface SeedQuestion {
  category: CategoryId;
  difficulty: Difficulty;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  tradition: string | null;
  validAsOf: string | null;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const QUESTIONS_PATH = path.resolve(here, '../../seed/questions.json');

/** Deterministic string hash (FNV-1a) so seeded answer positions are stable across installs. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function validateRawQuestion(r: RawQuestion): string | null {
  if (!CATEGORY_IDS.includes(r.c as CategoryId)) return `unknown category ${r.c}`;
  if (!DIFFICULTIES.includes(r.d as Difficulty)) return `unknown difficulty ${r.d}`;
  if (!r.q || r.q.length < 10) return 'question too short';
  if (!Array.isArray(r.w) || r.w.length !== 3) return 'needs exactly 3 wrong options';
  const all = [r.a, ...r.w].map((o) => o.trim().toLowerCase());
  if (new Set(all).size !== 4) return 'options must be distinct';
  if (!r.e) return 'explanation required';
  if (r.c === 'politics' && !r.asOf) return 'current-affairs questions need asOf date';
  return null;
}

export function toSeedQuestion(r: RawQuestion): SeedQuestion {
  const err = validateRawQuestion(r);
  if (err) throw new Error(`Invalid seed question "${r.q}": ${err}`);
  const correctIndex = hash(r.q) % 4;
  const options = [...r.w];
  options.splice(correctIndex, 0, r.a);
  return {
    category: r.c as CategoryId,
    difficulty: r.d as Difficulty,
    question: r.q,
    options,
    correctIndex,
    explanation: r.e,
    tradition: r.t ?? null,
    validAsOf: r.asOf ?? null,
  };
}

export function loadSeedQuestions(file = QUESTIONS_PATH): SeedQuestion[] {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as RawQuestion[];
  return raw.map(toSeedQuestion);
}
