// Wire types shared by server and client. The server is the single source of truth.
import type { GameSettings, AvatarId } from './rules';

export type RoomStatus = 'lobby' | 'in_progress' | 'finished';
export type MatchPhase = 'countdown' | 'question' | 'reveal' | 'finished';

export interface Profile {
  id: string;
  username: string;
  avatar: AvatarId;
  isGuest: boolean;
  xp: number;
  level: number;
  createdAt: string;
}

export interface PlayerStats {
  userId: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  totalPoints: number;
  questionsAnswered: number;
  questionsFaced: number;
  correctAnswers: number;
  accuracy: number; // 0..1, correct / faced
  currentWinStreak: number;
  bestWinStreak: number;
  highestScore: number;
  globalRank: number | null;
}

export interface PublicPlayer {
  userId: string;
  username: string;
  avatar: AvatarId;
  level: number;
  isHost: boolean;
  connected: boolean;
  score: number;
  correct: number;
  streak: number;
  /** answered the currently open question (never reveals which option) */
  answered: boolean;
  joinedAt: number;
}

export interface QuestionView {
  index: number;
  text: string;
  options: string[];
  category: string;
  difficulty: string;
  openedAt: number;
  closesAt: number;
}

export interface RevealResult {
  userId: string;
  choice: number | null;
  correct: boolean;
  points: number;
  speedBonus: number;
  streakBonus: number;
  responseMs: number | null;
}

export interface RevealView {
  index: number;
  correctIndex: number;
  explanation: string;
  results: RevealResult[];
}

export interface FinalStanding {
  userId: string;
  username: string;
  avatar: AvatarId;
  rank: number;
  score: number;
  correct: number;
  xpGained: number;
}

export interface MatchSnapshot {
  id: string;
  phase: MatchPhase;
  questionIndex: number; // -1 during countdown
  questionCount: number;
  timerSeconds: number;
  phaseEndsAt: number;
  question: QuestionView | null;
  reveal: RevealView | null;
  myAnswer: { index: number; choice: number } | null;
  standings: FinalStanding[] | null;
}

export interface RoomSnapshot {
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  hostId: string;
  status: RoomStatus;
  settings: GameSettings;
  players: PublicPlayer[];
  match: MatchSnapshot | null;
  serverNow: number;
}

export interface PublicRoomInfo {
  id: string;
  code: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
  categories: string[];
  difficulty: string;
}

export interface MatchHistoryItem {
  matchId: string;
  roomName: string;
  finishedAt: string;
  rank: number;
  playerCount: number;
  score: number;
  correct: number;
  questionCount: number;
  won: boolean;
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  username: string;
  avatar: AvatarId;
  level: number;
  points: number;
  wins: number;
  matches: number;
}

export type LeaderboardPeriod = 'daily' | 'weekly' | 'all';

export interface AuthResponse {
  token: string;
  profile: Profile;
}

// ---------------------------------------------------------------- websocket

export type ClientMessage =
  | { type: 'auth'; token: string; id?: string }
  | { type: 'ping'; t: number }
  | { type: 'room.subscribe'; roomId: string; id?: string }
  | { type: 'room.leave'; id?: string }
  | { type: 'room.settings'; settings: GameSettings; name?: string; isPublic?: boolean; id?: string }
  | { type: 'room.start'; id?: string }
  | { type: 'room.kick'; userId: string; id?: string }
  | { type: 'room.playAgain'; id?: string }
  | { type: 'answer'; questionIndex: number; choice: number; id?: string }
  | { type: 'lobby.subscribe'; id?: string }
  | { type: 'lobby.unsubscribe'; id?: string };

export type ServerMessage =
  | { type: 'hello'; userId: string; serverNow: number }
  | { type: 'pong'; t: number; serverNow: number }
  | { type: 'ack'; id: string; ok: boolean; error?: string; data?: unknown }
  | { type: 'room.state'; room: RoomSnapshot }
  | { type: 'room.removed'; roomId: string; reason: 'kicked' | 'left' | 'expired' }
  | { type: 'lobby.rooms'; rooms: PublicRoomInfo[] }
  | { type: 'error'; error: string };
