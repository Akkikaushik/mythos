import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LIMITS, type SettingsLimits } from '../../shared/rules';

export interface Timings {
  /** "Get ready" countdown before question 1 */
  countdownMs: number;
  /** how long the correct answer + explanation are shown */
  revealMs: number;
  /** network grace after closesAt during which answers are still accepted */
  answerGraceMs: number;
  /** how long a disconnected host keeps the crown before it migrates */
  hostGraceMs: number;
  /** disconnected players are dropped from a lobby after this long */
  lobbyDisconnectTtlMs: number;
  /** a room with nobody connected is closed after this long (not during a match) */
  emptyRoomTtlMs: number;
  /** idle lobby rooms are closed after this long */
  idleRoomTtlMs: number;
  cleanupIntervalMs: number;
}

export interface ServerConfig {
  port: number;
  host: string;
  /** null = in-memory database */
  dataDir: string | null;
  /** built frontend to serve (production / LAN play); null = API only */
  staticDir: string | null;
  limits: SettingsLimits;
  timings: Timings;
  minPlayersToStart: number;
  /** extra allowed CORS origins (the Vite dev server uses a proxy, so usually empty) */
  corsOrigins: string[];
  log: boolean;
  /** disable rate limits (integration tests drive many actions quickly) */
  rateLimits: boolean;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const DEFAULT_TIMINGS: Timings = {
  countdownMs: 4000,
  revealMs: 6000,
  answerGraceMs: 300,
  hostGraceMs: 10_000,
  lobbyDisconnectTtlMs: 60_000,
  emptyRoomTtlMs: 120_000,
  idleRoomTtlMs: 30 * 60_000,
  cleanupIntervalMs: 5_000,
};

export function configFromEnv(): ServerConfig {
  const env = process.env;
  return {
    port: Number(env.PORT ?? env.MYTHOS_PORT ?? 3001),
    host: env.MYTHOS_HOST ?? '0.0.0.0',
    dataDir: env.MYTHOS_DATA_DIR ? path.resolve(env.MYTHOS_DATA_DIR) : path.join(root, '.data'),
    staticDir: path.join(root, 'dist'),
    limits: DEFAULT_LIMITS,
    timings: DEFAULT_TIMINGS,
    minPlayersToStart: Number(env.MYTHOS_MIN_PLAYERS ?? 1),
    corsOrigins: (env.MYTHOS_CORS_ORIGINS ?? '').split(',').filter(Boolean),
    log: true,
    rateLimits: true,
  };
}
