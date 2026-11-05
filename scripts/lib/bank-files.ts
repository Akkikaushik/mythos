import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { listSeedFiles, normalizeQuestionText, readRawFile, SEED_ROOT, type RawQuestion } from '../../server/src/seed';

/** One question per line keeps git diffs readable. */
export function writeQuestionFile(file: string, questions: RawQuestion[]) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `[\n${questions.map((q) => `  ${JSON.stringify(q)}`).join(',\n')}\n]\n`);
}

/** Normalised text of every question in the bank, optionally ignoring some files (e.g. the one being rewritten). */
export function existingQuestionKeys(skip: (file: string) => boolean = () => false, root = SEED_ROOT): Set<string> {
  const keys = new Set<string>();
  for (const file of listSeedFiles(root)) {
    if (skip(path.resolve(file))) continue;
    for (const q of readRawFile(file)) if (typeof q?.q === 'string') keys.add(normalizeQuestionText(q.q));
  }
  return keys;
}
