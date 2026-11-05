import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { openDatabase, type Db } from './db';
import { hashPassword, loadSessionSecret, TokenSigner, verifyPassword } from './auth';
import type { ServerConfig } from './config';
import { AppError, badRequest, notFound, tooMany, unauthorized } from './errors';
import { RateLimiter } from './rateLimit';
import { GameEngine, type Conn } from './game/engine';
import * as repo from './repo';
import { AVATARS, CATEGORIES, isValidAvatar, MIXED_CATEGORY, validatePassword, validateUsername } from '../../shared/rules';
import type { ClientMessage, LeaderboardPeriod } from '../../shared/protocol';

const MAX_BODY = 16 * 1024;
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

export interface RunningServer {
  url: string;
  port: number;
  db: Db;
  engine: GameEngine;
  close(): Promise<void>;
}

type Handler = (ctx: Ctx) => Promise<unknown>;
interface Ctx {
  req: IncomingMessage;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: URLSearchParams;
  userId: () => string;
  ip: string;
}

export async function startServer(cfg: ServerConfig): Promise<RunningServer> {
  const db = await openDatabase(cfg.dataDir, cfg.log ? (msg) => console.log(`[mythos] ${msg}`) : undefined);
  const signer = new TokenSigner(loadSessionSecret(cfg.dataDir));
  const engine = new GameEngine(db, cfg);
  const authLimiter = new RateLimiter(10, 10 / 60);
  const apiLimiter = new RateLimiter(120, 2);

  const issue = (profile: { id: string }) => signer.sign(profile.id);

  // ---------------------------------------------------------------- routes
  const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];
  const route = (method: string, p: string, handler: Handler) => {
    const keys: string[] = [];
    const pattern = new RegExp('^' + p.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ method, pattern, keys, handler });
  };

  route('GET', '/api/health', async () => ({ ok: true, serverNow: Date.now() }));

  route('GET', '/api/meta', async () => ({
    categories: [...CATEGORIES, MIXED_CATEGORY],
    avatars: AVATARS,
    limits: cfg.limits,
    minPlayersToStart: cfg.minPlayersToStart,
  }));

  route('POST', '/api/auth/register', async ({ body, ip }) => {
    if (cfg.rateLimits && !authLimiter.take(ip)) throw tooMany();
    const u = validateUsername(body.username);
    if (!u.ok) throw badRequest(u.error);
    const pw = validatePassword(body.password);
    if (!pw.ok) throw badRequest(pw.error);
    const avatar = isValidAvatar(body.avatar) ? body.avatar : 'ronin';
    const profile = await repo.createProfile(db, {
      username: u.value,
      avatar,
      isGuest: false,
      passwordHash: await hashPassword(pw.value),
    });
    return { token: issue(profile), profile };
  });

  route('POST', '/api/auth/login', async ({ body, ip }) => {
    if (cfg.rateLimits && !authLimiter.take(ip)) throw tooMany();
    if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.password.length > 128) {
      throw badRequest('Username and password required');
    }
    const row = await repo.findLogin(db, body.username.trim());
    const ok = row ? await verifyPassword(body.password, row.password_hash) : false;
    if (!row || !ok) throw unauthorized('Invalid username or password');
    const profile = repo.toProfile(row);
    return { token: issue(profile), profile };
  });

  route('POST', '/api/auth/guest', async ({ ip }) => {
    if (cfg.rateLimits && !authLimiter.take(ip)) throw tooMany();
    for (let i = 0; i < 5; i++) {
      const username = `Guest_${Math.random().toString(36).slice(2, 8)}`;
      const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
      try {
        const profile = await repo.createProfile(db, { username, avatar, isGuest: true, passwordHash: null });
        return { token: issue(profile), profile };
      } catch (e) {
        if (!(e instanceof AppError && e.status === 409)) throw e;
      }
    }
    throw new AppError(503, 'Could not create a guest, try again');
  });

  route('GET', '/api/me', async ({ userId }) => {
    const profile = await repo.getProfile(db, userId());
    if (!profile) throw unauthorized('Account no longer exists');
    return { profile, currentRoom: engine.currentRoomOf(profile.id) };
  });

  route('PATCH', '/api/me', async ({ userId, body }) => {
    const patch: { username?: string; avatar?: string } = {};
    if (body.username !== undefined) {
      const u = validateUsername(body.username);
      if (!u.ok) throw badRequest(u.error);
      patch.username = u.value;
    }
    if (body.avatar !== undefined) {
      if (!isValidAvatar(body.avatar)) throw badRequest('Unknown avatar');
      patch.avatar = body.avatar;
    }
    return { profile: await repo.updateProfile(db, userId(), patch) };
  });

  route('GET', '/api/me/history', async ({ userId }) => ({ history: await repo.getHistory(db, userId()) }));

  route('GET', '/api/players/:id', async ({ params, userId }) => {
    userId();
    const profile = await repo.getProfile(db, params.id);
    if (!profile) throw notFound('Player not found');
    return { profile, stats: await repo.getStats(db, profile.id), history: await repo.getHistory(db, profile.id, 10) };
  });

  route('GET', '/api/leaderboard', async ({ query, userId }) => {
    userId();
    const p = query.get('period') ?? 'all';
    if (p !== 'daily' && p !== 'weekly' && p !== 'all') throw badRequest('period must be daily, weekly or all');
    return { period: p, rows: await repo.getLeaderboard(db, p as LeaderboardPeriod) };
  });

  route('GET', '/api/rooms/public', async ({ userId }) => {
    userId();
    return { rooms: engine.listPublicRooms() };
  });
  route('POST', '/api/rooms', async ({ userId, body }) => ({ room: await engine.createRoom(userId(), body) }));
  route('POST', '/api/rooms/join', async ({ userId, body }) => ({ room: await engine.joinRoom(userId(), body) }));
  route('POST', '/api/rooms/quickplay', async ({ userId }) => ({ room: await engine.quickPlay(userId()) }));

  // ---------------------------------------------------------------- http plumbing
  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };

  const readBody = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      if (req.method === 'GET' || req.method === 'HEAD') return resolve({});
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new AppError(413, 'Request body too large'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try {
          const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
        } catch {
          reject(badRequest('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });

  const serveStatic = (req: IncomingMessage, res: ServerResponse, pathname: string) => {
    if (!cfg.staticDir || !existsSync(path.join(cfg.staticDir, 'index.html'))) return false;
    const root = path.resolve(cfg.staticDir);
    let file = path.resolve(root, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(root)) return false;
    if (!existsSync(file) || !statSync(file).isFile()) file = path.join(root, 'index.html'); // SPA fallback
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
    return true;
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const origin = req.headers.origin;
    if (origin && cfg.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();

    if (!url.pathname.startsWith('/api/')) {
      if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(req, res, url.pathname)) return;
      return json(res, 404, { error: 'Not found' });
    }

    const ip = req.socket.remoteAddress ?? 'unknown';
    try {
      if (cfg.rateLimits && !apiLimiter.take(ip)) throw tooMany();
      const match = routes
        .map((r) => ({ r, m: r.method === req.method ? r.pattern.exec(url.pathname) : null }))
        .find((x) => x.m);
      if (!match) throw notFound('Not found');
      const params: Record<string, string> = {};
      match.r.keys.forEach((k, i) => (params[k] = decodeURIComponent(match.m![i + 1])));
      const body = await readBody(req);
      const userId = () => {
        const h = req.headers.authorization;
        const payload = signer.verify(h?.startsWith('Bearer ') ? h.slice(7) : null);
        if (!payload) throw unauthorized();
        return payload.sub;
      };
      json(res, 200, await match.r.handler({ req, body, params, query: url.searchParams, userId, ip }));
    } catch (e) {
      if (e instanceof AppError) return json(res, e.status, { error: e.message });
      console.error('[http] unhandled', e);
      json(res, 500, { error: 'Server error' });
    }
  });

  // ---------------------------------------------------------------- websocket
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 });
  const conns = new Set<Conn>();

  wss.on('connection', (ws: WebSocket) => {
    const conn: Conn = { ws, userId: null, roomId: null, lobby: false, limiter: new RateLimiter(40, 20) };
    conns.add(conn);
    let alive = true;
    const authTimer = setTimeout(() => !conn.userId && ws.close(4001, 'auth timeout'), 10_000);
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 15_000);
    ws.on('pong', () => (alive = true));

    ws.on('message', async (raw) => {
      alive = true;
      if (cfg.rateLimits && !conn.limiter.take('m')) {
        ws.send(JSON.stringify({ type: 'error', error: 'Too many messages' }));
        return;
      }
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') throw new Error();
      } catch {
        return ws.send(JSON.stringify({ type: 'error', error: 'Malformed message' }));
      }
      if (msg.type === 'auth') {
        const payload = signer.verify(msg.token);
        const profile = payload ? await repo.getProfile(db, payload.sub) : null;
        if (!profile) {
          ws.send(JSON.stringify({ type: 'ack', id: msg.id ?? 'auth', ok: false, error: 'Invalid session' }));
          return ws.close(4003, 'invalid session');
        }
        if (conn.userId && conn.userId !== profile.id) engine.unsubscribe(conn);
        conn.userId = profile.id;
        clearTimeout(authTimer);
        ws.send(JSON.stringify({ type: 'hello', userId: profile.id, serverNow: Date.now() }));
        if (msg.id) ws.send(JSON.stringify({ type: 'ack', id: msg.id, ok: true }));
        return;
      }
      if (!conn.userId) return ws.send(JSON.stringify({ type: 'error', error: 'Authenticate first' }));
      await engine.handleMessage(conn, msg);
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      clearInterval(heartbeat);
      conns.delete(conn);
      engine.unsubscribe(conn);
    });
    ws.on('error', () => ws.close());
  });

  await new Promise<void>((resolve) => server.listen(cfg.port, cfg.host, resolve));
  const port = (server.address() as AddressInfo).port;
  const url = `http://localhost:${port}`;
  if (cfg.log) console.log(`[mythos] server listening on ${url} (data: ${cfg.dataDir ?? 'in-memory'})`);

  return {
    url,
    port,
    db,
    engine,
    async close() {
      for (const c of conns) c.ws.terminate();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
      await engine.shutdown();
      await db.close();
    },
  };
}
