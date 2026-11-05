/** Validates every seed file, lists duplicates and prints counts per category and difficulty. */
import path from 'node:path';
import { collectSeedQuestions, formatIssues, SEED_ROOT } from '../server/src/seed';
import { CATEGORY_IDS, DIFFICULTIES } from '../shared/rules';

const { files, questions, issues } = collectSeedQuestions();

console.log(`Checked ${files.length} file(s) in ${path.relative(process.cwd(), SEED_ROOT) || '.'}`);

const rows = CATEGORY_IDS.map((c) => {
  const inCat = questions.filter((q) => q.category === c);
  return {
    category: c,
    ...Object.fromEntries(DIFFICULTIES.map((d) => [d, inCat.filter((q) => q.difficulty === d).length])),
    total: inCat.length,
  };
});
console.table(rows);
console.log(`Valid questions: ${questions.length}`);

const thin = rows.filter((r) => DIFFICULTIES.some((d) => (r as Record<string, unknown>)[d] === 0));
if (thin.length) console.warn(`Warning: missing a difficulty level in ${thin.map((r) => r.category).join(', ')}`);

if (issues.length) {
  console.error(`\n${issues.length} problem(s):\n${formatIssues(issues, issues.length)}`);
  process.exit(1);
}
console.log('All seed files are valid.');
