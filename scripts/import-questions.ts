/**
 * Imports questions into seed/imported/.
 *   npm run questions:import -- --csv my-pack.csv --out seed/imported/my-pack.json [--src "Credit line"]
 *   npm run questions:import -- --opentdb opentdb.json --out seed/imported/opentdb.json
 * Re-running with the same --out replaces that file. Rejected rows are listed; the run still succeeds.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { SEED_ROOT } from '../server/src/seed';
import { existingQuestionKeys, writeQuestionFile } from './lib/bank-files';
import { csvToQuestions, openTdbToQuestions, removeDuplicates, type ImportResult } from './lib/importers';

const { values } = parseArgs({
  options: {
    csv: { type: 'string' },
    opentdb: { type: 'string' },
    out: { type: 'string' },
    src: { type: 'string' },
  },
});

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

if (!!values.csv === !!values.opentdb) fail('Pass exactly one of --csv <file> or --opentdb <file>.');
if (!values.out) fail('Pass --out <file>, for example --out seed/imported/my-pack.json');

const input = (values.csv ?? values.opentdb)!;
if (!existsSync(input)) fail(`Input file not found: ${input}`);
const out = path.resolve(values.out);
const importedDir = path.join(SEED_ROOT, 'imported');
if (!out.startsWith(importedDir + path.sep) || !out.endsWith('.json')) {
  fail(`--out must be a .json file inside ${path.relative(process.cwd(), importedDir)}`);
}

let result: ImportResult;
try {
  const text = readFileSync(input, 'utf8');
  result = values.csv
    ? csvToQuestions(text, { src: values.src })
    : openTdbToQuestions(JSON.parse(text), { importedOn: new Date().toISOString().slice(0, 10) });
} catch (e) {
  fail(`Could not read ${input}: ${(e as Error).message}`);
}

// the output file itself is being replaced, so its old contents do not count as duplicates
const existing = existingQuestionKeys((file) => file === out);
const { questions, rejected } = removeDuplicates(result, existing);

writeQuestionFile(out, questions);
console.log(`Imported ${questions.length} question(s) into ${path.relative(process.cwd(), out)}`);
if (rejected.length) {
  console.log(`Skipped ${rejected.length} row(s):`);
  for (const r of rejected) console.log(`  row ${r.row}: ${r.reason}${r.question ? ` - "${r.question}"` : ''}`);
}
console.log('Restart the server to load them, and run `npm run questions:check` to validate the bank.');
