import type { Db, Queryable } from './db';
import { conflict, notFound } from './errors';
import { levelForXp, MIXED_CATEGORY, type AvatarId, type GameSettings } from '../../shared/rules';
import type { LeaderboardPeriod, LeaderboardRow, MatchHistoryItem, PlayerStats, Profile } from '../../shared/protocol';

interface ProfileRow {
  id: string;
  username: string;
  avatar: string;
  is_guest: boolean;
  xp: number;
  created_at: Date | string;
}

export function toProfile(r: ProfileRow): Profile {
  return {
    id: r.id,
    username: r.username,
    avatar: r.avatar as AvatarId,
    isGuest: r.is_guest,
    xp: r.xp,
    level: levelForXp(r.xp),
    createdAt: new Date(r.created_at).toISOString(),
  };
}

const PROFILE_COLS = 'id, username, avatar, is_guest, xp, created_at';

function isUniqueViolation(e: unknown) {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}

export async function createProfile(
  db: Db,
  input: { username: string; avatar: string; isGuest: boolean; passwordHash: string | null },
): Promise<Profile> {
  try {
    return await db.transaction(async (tx) => {
      const res = await tx.query<ProfileRow>(
        `insert into profiles (username, avatar, is_guest) values ($1,$2,$3) returning ${PROFILE_COLS}`,
        [input.username, input.avatar, input.isGuest],
      );
      const p = res.rows[0];
      if (input.passwordHash) {
        await tx.query('insert into credentials (user_id, password_hash) values ($1,$2)', [p.id, input.passwordHash]);
      }
      await tx.query('insert into player_stats (user_id) values ($1)', [p.id]);
      return toProfile(p);
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('That username is already taken');
    throw e;
  }
}

export async function findLogin(db: Db, username: string) {
  const res = await db.query<ProfileRow & { password_hash: string }>(
    `select p.id, p.username, p.avatar, p.is_guest, p.xp, p.created_at, c.password_hash
       from profiles p join credentials c on c.user_id = p.id
      where lower(p.username) = lower($1)`,
    [username],
  );
  return res.rows[0] ?? null;
}

export async function getProfile(db: Queryable, id: string): Promise<Profile | null> {
  if (!isUuid(id)) return null;
  const res = await db.query<ProfileRow>(`select ${PROFILE_COLS} from profiles where id = $1`, [id]);
  return res.rows[0] ? toProfile(res.rows[0]) : null;
}

export async function updateProfile(db: Db, id: string, patch: { username?: string; avatar?: string }): Promise<Profile> {
  try {
    const res = await db.query<ProfileRow>(
      `update profiles set username = coalesce($2, username), avatar = coalesce($3, avatar), updated_at = now()
        where id = $1 returning ${PROFILE_COLS}`,
      [id, patch.username ?? null, patch.avatar ?? null],
    );
    if (!res.rows[0]) throw notFound('Profile not found');
    return toProfile(res.rows[0]);
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('That username is already taken');
    throw e;
  }
}

export async function getStats(db: Db, userId: string): Promise<PlayerStats> {
  const res = await db.query<{
    matches_played: number;
    wins: number;
    losses: number;
    total_points: number | bigint;
    questions_faced: number;
    questions_answered: number;
    correct_answers: number;
    current_win_streak: number;
    best_win_streak: number;
    highest_score: number;
    global_rank: number | null;
  }>(
    `select s.*, case when s.matches_played > 0 then
        (select count(*)::int + 1 from player_stats o where o.matches_played > 0 and o.total_points > s.total_points)
      end as global_rank
       from player_stats s where s.user_id = $1`,
    [userId],
  );
  const s = res.rows[0];
  if (!s) throw notFound('Player not found');
  return {
    userId,
    matchesPlayed: s.matches_played,
    wins: s.wins,
    losses: s.losses,
    totalPoints: Number(s.total_points),
    questionsFaced: s.questions_faced,
    questionsAnswered: s.questions_answered,
    correctAnswers: s.correct_answers,
    accuracy: s.questions_faced > 0 ? s.correct_answers / s.questions_faced : 0,
    currentWinStreak: s.current_win_streak,
    bestWinStreak: s.best_win_streak,
    highestScore: s.highest_score,
    globalRank: s.global_rank,
  };
}

export async function getHistory(db: Db, userId: string, limit = 25): Promise<MatchHistoryItem[]> {
  const res = await db.query<{
    match_id: string;
    room_name: string;
    created_at: Date;
    rank: number;
    player_count: number;
    points: number;
    correct: number;
    question_count: number;
    won: boolean;
  }>(
    `select match_id, room_name, created_at, rank, player_count, points, correct, question_count, won
       from leaderboard_entries where user_id = $1 order by created_at desc, id desc limit $2`,
    [userId, limit],
  );
  return res.rows.map((r) => ({
    matchId: r.match_id,
    roomName: r.room_name,
    finishedAt: new Date(r.created_at).toISOString(),
    rank: r.rank,
    playerCount: r.player_count,
    score: r.points,
    correct: r.correct,
    questionCount: r.question_count,
    won: r.won,
  }));
}

export function periodStart(period: LeaderboardPeriod, now = new Date()): Date {
  if (period === 'all') return new Date(0);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === 'weekly') {
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - dow);
  }
  return d;
}

export async function getLeaderboard(db: Db, period: LeaderboardPeriod, limit = 50): Promise<LeaderboardRow[]> {
  const res = await db.query<{
    user_id: string;
    username: string;
    avatar: string;
    xp: number;
    points: number;
    wins: number;
    matches: number;
  }>(
    `select p.id as user_id, p.username, p.avatar, p.xp,
            sum(le.points)::int as points,
            (count(*) filter (where le.won))::int as wins,
            count(*)::int as matches
       from leaderboard_entries le join profiles p on p.id = le.user_id
      where le.created_at >= $1
      group by p.id
      order by points desc, wins desc, p.username asc
      limit $2`,
    [periodStart(period).toISOString(), limit],
  );
  return res.rows.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    username: r.username,
    avatar: r.avatar as AvatarId,
    level: levelForXp(r.xp),
    points: r.points,
    wins: r.wins,
    matches: r.matches,
  }));
}

export interface PickedQuestion {
  id: string;
  category: string;
  difficulty: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

/**
 * Random selection honouring the host's filters. If the filtered pool is too
 * small it tops up first with other difficulties of the same categories, then
 * with any category, so a match always has the requested length.
 */
export async function pickQuestions(db: Queryable, settings: GameSettings): Promise<PickedQuestion[]> {
  const mixed = settings.categories.includes(MIXED_CATEGORY.id);
  const cats = mixed ? null : settings.categories;
  const diff = settings.difficulty === 'mixed' ? null : settings.difficulty;
  const picked: PickedQuestion[] = [];
  const tiers: [string[] | null, string | null][] = [
    [cats, diff],
    [cats, null],
    [null, null],
  ];
  for (const [c, d] of tiers) {
    const need = settings.questionCount - picked.length;
    if (need <= 0) break;
    const res = await db.query<PickedQuestion>(
      `select id, category, difficulty, question, options, correct_index, explanation
         from questions
        where active
          and ($1::text[] is null or category = any($1::text[]))
          and ($2::text is null or difficulty = $2)
          and not (id = any($3::uuid[]))
        order by random() limit $4`,
      [c, d, picked.map((p) => p.id), need],
    );
    picked.push(...res.rows);
  }
  return picked;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s);
