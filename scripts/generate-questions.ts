/** Regenerates seed/generated/*.json from seed/data and arithmetic templates. Output is deterministic. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SEED_ROOT } from '../server/src/seed';
import { existingQuestionKeys, writeQuestionFile } from './lib/bank-files';
import { generateGeography, generateMaths, generateScience, mulberry32, type Country, type Element } from './lib/generators';

const generatedDir = path.join(SEED_ROOT, 'generated');
const readData = <T>(name: string) => JSON.parse(readFileSync(path.join(SEED_ROOT, 'data', name), 'utf8')) as T;

// questions written by hand or imported win over generated ones with the same text
const taken = existingQuestionKeys((file) => file.startsWith(path.resolve(generatedDir) + path.sep));

const outputs = {
  'geography.json': generateGeography(readData<Country[]>('countries.json'), mulberry32(1001), taken),
  'science.json': generateScience(readData<Element[]>('elements.json'), mulberry32(2002), taken),
  'mathematics.json': generateMaths(mulberry32(3003), taken),
};

for (const [name, questions] of Object.entries(outputs)) {
  writeQuestionFile(path.join(generatedDir, name), questions);
  console.log(`wrote ${questions.length} questions to seed/generated/${name}`);
}
console.log('Run `npm run questions:check` to validate the whole bank.');
