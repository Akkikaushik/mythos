// Pure game rules shared by the authoritative server, the frontend (display only)
// and, later, Supabase Edge Functions. No I/O, no Node/DOM APIs.

export const CATEGORIES = [
  { id: 'indian_mythology', label: 'Indian Mythology', glyph: '🕉' },
  { id: 'world_mythology', label: 'World Mythology', glyph: '⚡' },
  { id: 'general_knowledge', label: 'General Knowledge', glyph: '✦' },
  { id: 'science', label: 'Science', glyph: '⚗' },
  { id: 'technology', label: 'Technology', glyph: '⌬' },
  { id: 'history', label: 'History', glyph: '⚔' },
  { id: 'geography', label: 'Geography', glyph: '🜨' },
  { id: 'sports', label: 'Sports', glyph: '🏆' },
  { id: 'movies', label: 'Movies & Entertainment', glyph: '🎬' },
  { id: 'anime', label: 'Anime', glyph: '⛩' },
  { id: 'literature', label: 'Literature', glyph: '📜' },
  { id: 'politics', label: 'Politics & Current Affairs', glyph: '⚖' },
  { id: 'mathematics', label: 'Mathematics', glyph: '∑' },
] as const;

export const MIXED_CATEGORY = { id: 'mixed', label: 'Mixed Knowledge', glyph: '☯' } as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];
export const CATEGORY_IDS: readonly CategoryId[] = CATEGORIES.map((c) => c.id);

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export type DifficultySetting = Difficulty | 'mixed';

export function categoryLabel(id: string): string {
  if (id === MIXED_CATEGORY.id) return MIXED_CATEGORY.label;
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

// ---------------------------------------------------------------- scoring

export const SCORING = {
  correct: 100,
  maxSpeedBonus: 50,
  streakStep: 10,
  maxStreakBonus: 50,
} as const;

export interface ScoreInput {
  correct: boolean;
  /** ms between the server opening the round and the server receiving the answer */
  responseMs: number;
  /** total round length in ms */
  durationMs: number;
  /** consecutive correct answers immediately BEFORE this one */
  previousStreak: number;
}

export interface ScoreResult {
  points: number;
  base: number;
  speedBonus: number;
  streakBonus: number;
  /** streak after this answer */
  streak: number;
}

export function speedBonus(responseMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  const clamped = Math.min(Math.max(responseMs, 0), durationMs);
  return Math.round(SCORING.maxSpeedBonus * (1 - clamped / durationMs));
}

/** Bonus awarded for the Nth consecutive correct answer (streak >= 2). */
export function streakBonus(streak: number): number {
  if (streak < 2) return 0;
  return Math.min(SCORING.streakStep * (streak - 1), SCORING.maxStreakBonus);
}

export function scoreAnswer(input: ScoreInput): ScoreResult {
  if (!input.correct) {
    return { points: 0, base: 0, speedBonus: 0, streakBonus: 0, streak: 0 };
  }
  const streak = Math.max(0, input.previousStreak) + 1;
  const base = SCORING.correct;
  const speed = speedBonus(input.responseMs, input.durationMs);
  const bonus = streakBonus(streak);
  return { points: base + speed + bonus, base, speedBonus: speed, streakBonus: bonus, streak };
}

// ---------------------------------------------------------------- ranking

export interface RankablePlayer {
  userId: string;
  score: number;
  correct: number;
  /** sum of response times of correct answers, lower is better */
  totalResponseMs: number;
  joinedAt: number;
}

/** Deterministic ranking: score desc, correct desc, faster desc, earlier join. */
export function rankPlayers<T extends RankablePlayer>(players: T[]): (T & { rank: number })[] {
  return [...players]
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.correct - a.correct ||
        a.totalResponseMs - b.totalResponseMs ||
        a.joinedAt - b.joinedAt ||
        a.userId.localeCompare(b.userId),
    )
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

// ---------------------------------------------------------------- progression

export function xpForMatch(points: number, won: boolean, playerCount: number): number {
  const participation = 20;
  const winBonus = won && playerCount > 1 ? 100 : 0;
  return participation + Math.floor(points / 10) + winBonus;
}

export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

export function xpForLevel(level: number): number {
  return 100 * (level - 1) ** 2;
}

export function levelProgress(xp: number): { level: number; current: number; needed: number; pct: number } {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const current = xp - floor;
  const needed = next - floor;
  return { level, current, needed, pct: needed > 0 ? Math.min(1, current / needed) : 1 };
}

export const RANK_TIERS = [
  { min: 1, name: 'Initiate', color: '#9ca3af' },
  { min: 3, name: 'Adept', color: '#38d5ff' },
  { min: 6, name: 'Warrior', color: '#9b5cff' },
  { min: 10, name: 'Champion', color: '#ff5c7a' },
  { min: 15, name: 'Mythic', color: '#ffd34d' },
] as const;

export function rankTier(level: number) {
  let tier: (typeof RANK_TIERS)[number] = RANK_TIERS[0];
  for (const t of RANK_TIERS) if (level >= t.min) tier = t;
  return tier;
}

// ---------------------------------------------------------------- rooms & settings

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidRoomCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH && [...code].every((c) => ROOM_CODE_ALPHABET.includes(c));
}

export interface GameSettings {
  categories: string[]; // CategoryId[] or ['mixed']
  difficulty: DifficultySetting;
  questionCount: number;
  timerSeconds: number;
  maxPlayers: number;
}

export interface SettingsLimits {
  minQuestions: number;
  maxQuestions: number;
  minTimer: number;
  maxTimer: number;
  minPlayers: number;
  maxPlayers: number;
}

export const DEFAULT_LIMITS: SettingsLimits = {
  minQuestions: 10,
  maxQuestions: 15,
  minTimer: 10,
  maxTimer: 30,
  minPlayers: 2,
  maxPlayers: 20,
};

export const DEFAULT_SETTINGS: GameSettings = {
  categories: [MIXED_CATEGORY.id],
  difficulty: 'mixed',
  questionCount: 10,
  timerSeconds: 20,
  maxPlayers: 20,
};

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

function intInRange(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  return v >= min && v <= max ? v : null;
}

export function validateSettings(input: unknown, limits: SettingsLimits = DEFAULT_LIMITS): Validation<GameSettings> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Settings must be an object' };
  const s = input as Record<string, unknown>;

  const rawCats = s.categories;
  if (!Array.isArray(rawCats) || rawCats.length === 0) return { ok: false, error: 'Pick at least one category' };
  const cats = [...new Set(rawCats)];
  if (cats.some((c) => typeof c !== 'string')) return { ok: false, error: 'Invalid category' };
  let categories = cats as string[];
  if (categories.includes(MIXED_CATEGORY.id)) categories = [MIXED_CATEGORY.id];
  else if (categories.some((c) => !CATEGORY_IDS.includes(c as CategoryId))) return { ok: false, error: 'Unknown category' };

  const difficulty = s.difficulty;
  if (difficulty !== 'mixed' && !DIFFICULTIES.includes(difficulty as Difficulty)) {
    return { ok: false, error: 'Invalid difficulty' };
  }

  const questionCount = intInRange(s.questionCount, limits.minQuestions, limits.maxQuestions);
  if (questionCount === null) {
    return { ok: false, error: `Questions must be ${limits.minQuestions}-${limits.maxQuestions}` };
  }
  const timerSeconds = intInRange(s.timerSeconds, limits.minTimer, limits.maxTimer);
  if (timerSeconds === null) return { ok: false, error: `Timer must be ${limits.minTimer}-${limits.maxTimer} seconds` };
  const maxPlayers = intInRange(s.maxPlayers, limits.minPlayers, limits.maxPlayers);
  if (maxPlayers === null) return { ok: false, error: `Max players must be ${limits.minPlayers}-${limits.maxPlayers}` };

  return {
    ok: true,
    value: { categories, difficulty: difficulty as DifficultySetting, questionCount, timerSeconds, maxPlayers },
  };
}

// ---------------------------------------------------------------- identity validation

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export function validateUsername(name: unknown): Validation<string> {
  if (typeof name !== 'string') return { ok: false, error: 'Username required' };
  const v = name.trim();
  if (!USERNAME_RE.test(v)) return { ok: false, error: 'Username must be 3-20 letters, numbers or _' };
  return { ok: true, value: v };
}

export function validatePassword(pw: unknown): Validation<string> {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128) {
    return { ok: false, error: 'Password must be 8-128 characters' };
  }
  return { ok: true, value: pw };
}

export function validateRoomName(name: unknown): Validation<string> {
  if (typeof name !== 'string') return { ok: false, error: 'Room name required' };
  const v = name.trim().replace(/\s+/g, ' ');
  if (v.length < 3 || v.length > 32) return { ok: false, error: 'Room name must be 3-32 characters' };
  if (/[<>]/.test(v)) return { ok: false, error: 'Room name contains invalid characters' };
  return { ok: true, value: v };
}

export const AVATARS = [
  'ronin', 'kitsune', 'oni', 'valkyrie', 'garuda', 'naga', 'phoenix', 'raijin', 'shiva', 'athena', 'anubis', 'kirin',
] as const;
export type AvatarId = (typeof AVATARS)[number];

export function isValidAvatar(a: unknown): a is AvatarId {
  return typeof a === 'string' && (AVATARS as readonly string[]).includes(a);
}

// ---------------------------------------------------------------- clock sync

/** NTP-style offset estimate: serverNow - midpoint of the client round trip. */
export function estimateClockOffset(clientSentAt: number, serverNow: number, clientReceivedAt: number): number {
  return serverNow - (clientSentAt + (clientReceivedAt - clientSentAt) / 2);
}

export function remainingMs(endsAt: number, clientNow: number, offset: number): number {
  return Math.max(0, endsAt - (clientNow + offset));
}
