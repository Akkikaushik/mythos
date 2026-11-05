// Converts external question sources into the seed format. Every row goes through the same
// validation as hand-written questions; problems are reported per row instead of aborting.
import { normalizeQuestionText, validateRawQuestion, type RawQuestion } from '../../server/src/seed';
import { CATEGORIES, type CategoryId } from '../../shared/rules';

export interface Rejected {
  /** 1-based row number in the source (CSV header is row 1) */
  row: number;
  question: string;
  reason: string;
}

export interface ImportResult {
  questions: RawQuestion[];
  rejected: Rejected[];
  /** source row of each accepted question */
  rows: Map<RawQuestion, number>;
}

// ---------------------------------------------------------------- CSV

/** RFC 4180 style: quoted fields may contain commas, newlines and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error('CSV ends inside a quoted field');
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export const CSV_COLUMNS = ['category', 'difficulty', 'question', 'answer', 'wrong1', 'wrong2', 'wrong3', 'explanation', 'tradition', 'asOf'] as const;
const REQUIRED_COLUMNS = CSV_COLUMNS.filter((c) => c !== 'tradition' && c !== 'asOf');

/** Accepts category ids ("world_mythology") or labels ("World Mythology"), case-insensitive. */
export function resolveCategory(value: string): CategoryId | null {
  const v = value.trim().toLowerCase();
  const hit = CATEGORIES.find((c) => c.id === v || c.label.toLowerCase() === v);
  return hit ? hit.id : null;
}

export function csvToQuestions(text: string, opts: { src?: string } = {}): ImportResult {
  const table = parseCsv(text);
  if (!table.length) throw new Error('CSV is empty');
  const header = table[0].map((h) => h.trim());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`CSV is missing column(s): ${missing.join(', ')}`);
  const col = (r: string[], name: string) => {
    const i = header.indexOf(name);
    return i === -1 ? '' : (r[i] ?? '').trim();
  };

  const questions: RawQuestion[] = [];
  const rejected: Rejected[] = [];
  const rows = new Map<RawQuestion, number>();
  table.slice(1).forEach((r, i) => {
    const rowNo = i + 2;
    const category = resolveCategory(col(r, 'category'));
    const q: RawQuestion = {
      c: category ?? col(r, 'category'),
      d: col(r, 'difficulty').toLowerCase(),
      q: col(r, 'question'),
      a: col(r, 'answer'),
      w: [col(r, 'wrong1'), col(r, 'wrong2'), col(r, 'wrong3')],
      e: col(r, 'explanation'),
      t: col(r, 'tradition') || null,
    };
    const asOf = col(r, 'asOf');
    if (asOf) q.asOf = asOf;
    if (opts.src) q.src = opts.src;
    const err = validateRawQuestion(q);
    if (err) {
      rejected.push({ row: rowNo, question: q.q, reason: err });
      return;
    }
    questions.push(q);
    rows.set(q, rowNo);
  });
  return { questions, rejected, rows };
}

// ---------------------------------------------------------------- Open Trivia DB

export const OPENTDB_SOURCE = 'Open Trivia DB (CC BY-SA 4.0)';

/** Open Trivia DB category name -> MYTHOS category. Unlisted categories are skipped. */
export const OPENTDB_CATEGORIES: Record<string, CategoryId> = {
  'General Knowledge': 'general_knowledge',
  'Entertainment: Books': 'literature',
  'Entertainment: Film': 'movies',
  'Entertainment: Television': 'movies',
  'Entertainment: Music': 'movies',
  'Entertainment: Musicals & Theatres': 'movies',
  'Entertainment: Cartoon & Animations': 'movies',
  'Entertainment: Japanese Anime & Manga': 'anime',
  'Science & Nature': 'science',
  'Science: Computers': 'technology',
  'Science: Gadgets': 'technology',
  'Science: Mathematics': 'mathematics',
  Mythology: 'world_mythology',
  Sports: 'sports',
  Geography: 'geography',
  History: 'history',
  Politics: 'politics',
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', shy: '',
  hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  deg: '°', pi: 'π', times: '×', divide: '÷', sup2: '²', sup3: '³', frac12: '½', copy: '©', reg: '®', trade: '™',
  eacute: 'é', Eacute: 'É', egrave: 'è', Egrave: 'È', ecirc: 'ê', euml: 'ë',
  aacute: 'á', Aacute: 'Á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä', Auml: 'Ä', aring: 'å', Aring: 'Å', aelig: 'æ',
  iacute: 'í', Iacute: 'Í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  oacute: 'ó', Oacute: 'Ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', ouml: 'ö', Ouml: 'Ö', oslash: 'ø', Oslash: 'Ø',
  uacute: 'ú', Uacute: 'Ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü', Uuml: 'Ü',
  ntilde: 'ñ', Ntilde: 'Ñ', ccedil: 'ç', Ccedil: 'Ç', szlig: 'ß', yacute: 'ý',
};

/** Decodes HTML entities; throws on an entity it does not know so garbled text never gets in. */
export function decodeHtml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (_, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return String.fromCodePoint(code);
    }
    const v = NAMED_ENTITIES[body];
    if (v === undefined) throw new Error(`unknown HTML entity &${body};`);
    return v;
  });
}

interface OpenTdbResult {
  type?: string;
  difficulty?: string;
  category?: string;
  question?: string;
  correct_answer?: string;
  incorrect_answers?: string[];
}

export function openTdbToQuestions(data: unknown, opts: { importedOn: string }): ImportResult {
  const results: OpenTdbResult[] = Array.isArray(data)
    ? (data as OpenTdbResult[])
    : Array.isArray((data as { results?: unknown })?.results)
      ? ((data as { results: OpenTdbResult[] }).results)
      : (() => {
          throw new Error('expected an Open Trivia DB response ({"results": [...]}) or an array of results');
        })();

  const questions: RawQuestion[] = [];
  const rejected: Rejected[] = [];
  const rows = new Map<RawQuestion, number>();
  results.forEach((r, i) => {
    const row = i + 1;
    let text = '';
    try {
      text = decodeHtml(r.question ?? '');
      if (r.type !== 'multiple') throw new Error('only multiple-choice questions are imported');
      // category names arrive HTML-encoded too, e.g. "Japanese Anime &amp; Manga"
      const category = OPENTDB_CATEGORIES[decodeHtml(r.category ?? '')];
      if (!category) throw new Error(`category "${r.category}" is not mapped`);
      const answer = decodeHtml(r.correct_answer ?? '');
      const q: RawQuestion = {
        c: category,
        d: (r.difficulty ?? '').toLowerCase(),
        q: text,
        a: answer,
        w: (r.incorrect_answers ?? []).map(decodeHtml),
        e: `The correct answer is ${answer}. Source: Open Trivia DB.`,
        t: null,
        src: OPENTDB_SOURCE,
      };
      if (category === 'politics') q.asOf = opts.importedOn;
      const err = validateRawQuestion(q);
      if (err) throw new Error(err);
      questions.push(q);
      rows.set(q, row);
    } catch (e) {
      rejected.push({ row, question: text || String(r.question ?? ''), reason: (e as Error).message });
    }
  });
  return { questions, rejected, rows };
}

// ---------------------------------------------------------------- shared

/** Drops questions already in the bank (or repeated within the import), reporting them as rejected. */
export function removeDuplicates(result: ImportResult, existing: Set<string>): ImportResult {
  const seen = new Set(existing);
  const questions: RawQuestion[] = [];
  const rejected = [...result.rejected];
  const rows = new Map<RawQuestion, number>();
  for (const q of result.questions) {
    const key = normalizeQuestionText(q.q);
    const row = result.rows.get(q) ?? 0;
    if (seen.has(key)) {
      rejected.push({ row, question: q.q, reason: 'duplicate of a question already in the bank' });
      continue;
    }
    seen.add(key);
    questions.push(q);
    rows.set(q, row);
  }
  rejected.sort((a, b) => a.row - b.row);
  return { questions, rejected, rows };
}
