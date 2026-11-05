import { randomInt } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { Db } from '../db';
import type { ServerConfig } from '../config';
import { AppError, badRequest, conflict, forbidden, notFound, tooMany } from '../errors';
import { RateLimiter } from '../rateLimit';
import { getProfile, pickQuestions } from '../repo';
import {
  DEFAULT_SETTINGS,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  rankPlayers,
  scoreAnswer,
  validateRoomName,
  validateSettings,
  xpForMatch,
  levelForXp,
  type AvatarId,
  type GameSettings,
} from '../../../shared/rules';
import type {
  ClientMessage,
  FinalStanding,
  MatchPhase,
  MatchSnapshot,
  PublicPlayer,
  PublicRoomInfo,
  RevealResult,
  RevealView,
  RoomSnapshot,
  RoomStatus,
  ServerMessage,
} from '../../../shared/protocol';

// ------------------------------------------------------------------ live state

export interface Conn {
  ws: WebSocket;
  userId: string | null;
  roomId: string | null;
  lobby: boolean;
  limiter: RateLimiter;
}

interface Member {
  userId: string;
  username: string;
  avatar: AvatarId;
  level: number;
  joinedAt: number;
  conns: Set<Conn>;
  disconnectedAt: number | null;
}

interface LiveQuestion {
  questionId: string;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  category: string;
  difficulty: string;
}

interface AnswerRec {
  choice: number;
  correct: boolean;
  responseMs: number;
  points: number;
  speedBonus: number;
  streakBonus: number;
}

interface PlayerScore {
  userId: string;
  username: string;
  avatar: AvatarId;
  joinedAt: number;
  score: number;
  correct: number;
  answered: number;
  streak: number;
  totalResponseMs: number;
}

interface LiveMatch {
  id: string;
  settings: GameSettings;
  questions: LiveQuestion[];
  phase: MatchPhase;
  index: number;
  phaseEndsAt: number;
  openedAt: number;
  closesAt: number;
  answers: Map<string, AnswerRec>[];
  scores: Map<string, PlayerScore>;
  reveal: RevealView | null;
  standings: FinalStanding[] | null;
  timer: NodeJS.Timeout | null;
}

interface Room {
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  hostId: string;
  status: RoomStatus | 'closed';
  settings: GameSettings;
  members: Map<string, Member>;
  banned: Set<string>;
  conns: Set<Conn>;
  match: LiveMatch | null;
  starting: boolean;
  lastActivity: number;
  emptySince: number | null;
  hostTimer: NodeJS.Timeout | null;
}

const send = (conn: Conn, msg: ServerMessage) => {
  if (conn.ws.readyState === 1) conn.ws.send(JSON.stringify(msg));
};

// ------------------------------------------------------------------ engine

export class GameEngine {
  private rooms = new Map<string, Room>();
  private byCode = new Map<string, string>();
  private userRoom = new Map<string, string>();
  private lobbyConns = new Set<Conn>();
  private lobbyTimer: NodeJS.Timeout | null = null;
  private sweepTimer: NodeJS.Timeout;
  private createLimiter = new RateLimiter(5, 5 / 60);
  private joinLimiter = new RateLimiter(20, 20 / 60);
  private pending = new Set<Promise<unknown>>();

  constructor(
    private readonly db: Db,
    private readonly cfg: ServerConfig,
  ) {
    this.sweepTimer = setInterval(() => this.sweep(), cfg.timings.cleanupIntervalMs);
    this.sweepTimer.unref();
  }

  /** Track fire-and-forget DB writes so shutdown/tests can await them. */
  private track<T>(p: Promise<T>): Promise<T> {
    this.pending.add(p);
    p.catch((e) => console.error('[engine] db error', e)).finally(() => this.pending.delete(p));
    return p;
  }

  async flush() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  async shutdown() {
    clearInterval(this.sweepTimer);
    if (this.lobbyTimer) clearTimeout(this.lobbyTimer);
    for (const room of this.rooms.values()) {
      if (room.match?.timer) clearTimeout(room.match.timer);
      if (room.hostTimer) clearTimeout(room.hostTimer);
    }
    await this.flush();
  }

  private log(...args: unknown[]) {
    if (this.cfg.log) console.log('[engine]', ...args);
  }

  private now() {
    return Date.now();
  }

  // ---------------------------------------------------------------- HTTP-facing

  async createRoom(userId: string, input: { name?: unknown; isPublic?: unknown; settings?: unknown }): Promise<RoomSnapshot> {
    if (this.cfg.rateLimits && !this.createLimiter.take(userId)) throw tooMany('You are creating rooms too quickly');
    const name = validateRoomName(input.name);
    if (!name.ok) throw badRequest(name.error);
    const settings = validateSettings(input.settings ?? DEFAULT_SETTINGS, this.cfg.limits);
    if (!settings.ok) throw badRequest(settings.error);
    if (input.isPublic !== undefined && typeof input.isPublic !== 'boolean') throw badRequest('isPublic must be boolean');
    return this.snapshot(await this.openRoom(userId, name.value, input.isPublic === true, settings.value), userId);
  }

  private async openRoom(userId: string, name: string, isPublic: boolean, settings: GameSettings): Promise<Room> {
    const profile = await getProfile(this.db, userId);
    if (!profile) throw notFound('Profile not found');
    let code = generateRoomCode(() => randomInt(0, 1 << 30) / (1 << 30));
    for (let i = 0; this.byCode.has(code) && i < 20; i++) code = generateRoomCode(() => randomInt(0, 1 << 30) / (1 << 30));
    if (this.byCode.has(code)) throw new AppError(503, 'Could not allocate a room code, try again');

    const res = await this.db.query<{ id: string }>(
      `insert into rooms (code, name, host_id, is_public, settings) values ($1,$2,$3,$4,$5::jsonb) returning id`,
      [code, name, userId, isPublic, JSON.stringify(settings)],
    );
    const room: Room = {
      id: res.rows[0].id,
      code,
      name,
      isPublic,
      hostId: userId,
      status: 'lobby',
      settings,
      members: new Map(),
      banned: new Set(),
      conns: new Set(),
      match: null,
      starting: false,
      lastActivity: this.now(),
      emptySince: null,
      hostTimer: null,
    };
    this.rooms.set(room.id, room);
    this.byCode.set(code, room.id);
    await this.addMember(room, userId);
    this.log(`room ${code} created by ${profile.username} (${isPublic ? 'public' : 'private'})`);
    return room;
  }

  async joinRoom(userId: string, input: { code?: unknown; roomId?: unknown }): Promise<RoomSnapshot> {
    if (this.cfg.rateLimits && !this.joinLimiter.take(userId)) throw tooMany();
    let room: Room | undefined;
    if (typeof input.code === 'string') {
      const code = normalizeRoomCode(input.code);
      if (!isValidRoomCode(code)) throw badRequest('Room codes are 6 letters/numbers');
      const id = this.byCode.get(code);
      room = id ? this.rooms.get(id) : undefined;
    } else if (typeof input.roomId === 'string') {
      room = this.rooms.get(input.roomId);
      if (room && !room.isPublic && !room.members.has(userId)) throw forbidden('Private rooms can only be joined with a code');
    } else {
      throw badRequest('Provide a room code');
    }
    if (!room || room.status === 'closed') throw notFound('Room not found or no longer open');
    await this.addMember(room, userId);
    return this.snapshot(room, userId);
  }

  async quickPlay(userId: string): Promise<RoomSnapshot> {
    if (this.cfg.rateLimits && !this.joinLimiter.take(userId)) throw tooMany();
    const current = this.userRoom.get(userId);
    const candidates = [...this.rooms.values()]
      .filter(
        (r) =>
          r.isPublic &&
          (r.status === 'lobby' || r.status === 'finished') &&
          r.id !== current &&
          !r.banned.has(userId) &&
          r.members.size < r.settings.maxPlayers &&
          this.connectedCount(r) > 0,
      )
      .sort((a, b) => b.members.size - a.members.size || a.lastActivity - b.lastActivity);
    for (const room of candidates) {
      try {
        await this.addMember(room, userId);
        return this.snapshot(room, userId);
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
      }
    }
    const room = await this.openRoom(userId, `Quick Battle ${generateRoomCode().slice(0, 3)}`, true, DEFAULT_SETTINGS);
    return this.snapshot(room, userId);
  }

  listPublicRooms(): PublicRoomInfo[] {
    return [...this.rooms.values()]
      .filter((r) => r.isPublic && r.status !== 'closed' && r.members.size > 0)
      .sort(
        (a, b) =>
          Number(a.status === 'in_progress') - Number(b.status === 'in_progress') ||
          b.members.size - a.members.size ||
          b.lastActivity - a.lastActivity,
      )
      .slice(0, 50)
      .map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        hostName: r.members.get(r.hostId)?.username ?? '—',
        playerCount: r.members.size,
        maxPlayers: r.settings.maxPlayers,
        status: r.status as RoomStatus,
        categories: r.settings.categories,
        difficulty: r.settings.difficulty,
      }));
  }

  currentRoomOf(userId: string): RoomSnapshot | null {
    const id = this.userRoom.get(userId);
    const room = id ? this.rooms.get(id) : undefined;
    return room ? this.snapshot(room, userId) : null;
  }

  // ---------------------------------------------------------------- membership

  private async addMember(room: Room, userId: string) {
    if (room.members.has(userId)) return; // rejoin / reconnect: nothing to do
    if (room.banned.has(userId)) throw forbidden('You were removed from this room by the host');
    if (room.status === 'in_progress' && !room.match?.scores.has(userId)) {
      throw conflict('This battle is already in progress. Spectating is not supported - wait for the next round.');
    }
    if (room.members.size >= room.settings.maxPlayers) throw conflict('Room is full');

    const profile = await getProfile(this.db, userId);
    if (!profile) throw notFound('Profile not found');
    // re-check after the await: another join may have filled the last slot
    if (room.members.has(userId)) return;
    if (room.members.size >= room.settings.maxPlayers) throw conflict('Room is full');
    if (room.status === 'closed') throw notFound('Room no longer open');

    const previous = this.userRoom.get(userId);
    if (previous && previous !== room.id) {
      const prevRoom = this.rooms.get(previous);
      if (prevRoom) this.removeMember(prevRoom, userId, 'left');
    }

    room.members.set(userId, {
      userId,
      username: profile.username,
      avatar: profile.avatar,
      level: profile.level,
      joinedAt: this.now(),
      conns: new Set(),
      disconnectedAt: this.now(),
    });
    this.userRoom.set(userId, room.id);
    room.lastActivity = this.now();
    this.track(
      this.db.query(
        `insert into room_players (room_id, user_id) values ($1,$2)
         on conflict (room_id, user_id) do update set left_at = null, joined_at = now()`,
        [room.id, userId],
      ),
    );
    this.broadcast(room);
    this.lobbyChanged();
  }

  private removeMember(room: Room, userId: string, reason: 'kicked' | 'left' | 'expired') {
    const member = room.members.get(userId);
    if (!member) return;
    room.members.delete(userId);
    if (this.userRoom.get(userId) === room.id) this.userRoom.delete(userId);
    for (const conn of member.conns) {
      room.conns.delete(conn);
      conn.roomId = null;
      send(conn, { type: 'room.removed', roomId: room.id, reason });
    }
    this.track(this.db.query('update room_players set left_at = now() where room_id = $1 and user_id = $2', [room.id, userId]));
    if (room.members.size === 0) {
      this.closeRoom(room);
      return;
    }
    if (room.hostId === userId) this.migrateHost(room);
    room.lastActivity = this.now();
    this.broadcast(room);
    this.lobbyChanged();
  }

  private closeRoom(room: Room) {
    if (room.status === 'closed') return;
    if (room.match?.timer) clearTimeout(room.match.timer);
    if (room.match && room.match.phase !== 'finished') {
      this.track(this.db.query(`update matches set status = 'abandoned', finished_at = now() where id = $1`, [room.match.id]));
    }
    if (room.hostTimer) clearTimeout(room.hostTimer);
    room.status = 'closed';
    for (const m of room.members.values()) {
      for (const conn of m.conns) {
        conn.roomId = null;
        send(conn, { type: 'room.removed', roomId: room.id, reason: 'expired' });
      }
      if (this.userRoom.get(m.userId) === room.id) this.userRoom.delete(m.userId);
    }
    this.rooms.delete(room.id);
    this.byCode.delete(room.code);
    this.track(
      this.db.query(`update rooms set status = 'closed', closed_at = now() where id = $1`, [room.id]).then(() =>
        this.db.query('update room_players set left_at = now() where room_id = $1 and left_at is null', [room.id]),
      ),
    );
    this.log(`room ${room.code} closed`);
    this.lobbyChanged();
  }

  private connectedCount(room: Room) {
    let n = 0;
    for (const m of room.members.values()) if (m.conns.size > 0) n++;
    return n;
  }

  private migrateHost(room: Room) {
    const candidates = [...room.members.values()].sort(
      (a, b) => Number(b.conns.size > 0) - Number(a.conns.size > 0) || a.joinedAt - b.joinedAt,
    );
    const next = candidates.find((m) => m.userId !== room.hostId) ?? candidates[0];
    if (!next || next.userId === room.hostId) return;
    room.hostId = next.userId;
    if (room.hostTimer) clearTimeout(room.hostTimer);
    room.hostTimer = null;
    this.track(this.db.query('update rooms set host_id = $2 where id = $1', [room.id, next.userId]));
    this.log(`room ${room.code}: host migrated to ${next.username}`);
  }

  // ---------------------------------------------------------------- websocket

  async handleMessage(conn: Conn, msg: ClientMessage) {
    const userId = conn.userId!;
    const ack = (ok: boolean, extra: { error?: string; data?: unknown } = {}) => {
      if ('id' in msg && msg.id) send(conn, { type: 'ack', id: msg.id, ok, ...extra });
    };
    try {
      switch (msg.type) {
        case 'ping':
          send(conn, { type: 'pong', t: msg.t, serverNow: this.now() });
          return;
        case 'lobby.subscribe':
          this.lobbyConns.add(conn);
          conn.lobby = true;
          send(conn, { type: 'lobby.rooms', rooms: this.listPublicRooms() });
          return ack(true);
        case 'lobby.unsubscribe':
          this.lobbyConns.delete(conn);
          conn.lobby = false;
          return ack(true);
        case 'room.subscribe':
          this.subscribe(conn, msg.roomId);
          return ack(true);
        case 'room.leave': {
          const room = this.memberRoom(userId);
          this.removeMember(room, userId, 'left');
          return ack(true);
        }
        case 'room.settings':
          this.updateSettings(userId, msg);
          return ack(true);
        case 'room.kick': {
          const room = this.hostRoom(userId);
          if (room.status === 'in_progress') throw conflict('Cannot remove players during a battle');
          if (msg.userId === userId) throw badRequest('You cannot kick yourself');
          if (!room.members.has(msg.userId)) throw notFound('Player not in room');
          room.banned.add(msg.userId);
          this.removeMember(room, msg.userId, 'kicked');
          return ack(true);
        }
        case 'room.start':
          await this.startMatch(userId);
          return ack(true);
        case 'room.playAgain': {
          const room = this.hostRoom(userId);
          if (room.status !== 'finished') throw conflict('The battle has not finished yet');
          room.status = 'lobby';
          room.match = null;
          room.lastActivity = this.now();
          this.track(this.db.query(`update rooms set status = 'lobby', last_activity_at = now() where id = $1`, [room.id]));
          this.broadcast(room);
          this.lobbyChanged();
          return ack(true);
        }
        case 'answer': {
          const data = this.submitAnswer(userId, msg.questionIndex, msg.choice);
          return ack(true, { data });
        }
        default:
          throw badRequest('Unknown message');
      }
    } catch (e) {
      const error = e instanceof AppError ? e.message : 'Server error';
      if (!(e instanceof AppError)) this.log('ws handler error', e);
      ack(false, { error });
      if (!('id' in msg && msg.id)) send(conn, { type: 'error', error });
    }
  }

  private subscribe(conn: Conn, roomId: unknown) {
    const userId = conn.userId!;
    const room = typeof roomId === 'string' ? this.rooms.get(roomId) : undefined;
    if (!room) throw notFound('Room not found or no longer open');
    const member = room.members.get(userId);
    if (!member) throw forbidden('You are not a member of this room');
    if (conn.roomId && conn.roomId !== room.id) this.unsubscribe(conn);
    if (!member.conns.has(conn)) {
      member.conns.add(conn);
      room.conns.add(conn);
      conn.roomId = room.id;
    }
    member.disconnectedAt = null;
    room.emptySince = null;
    if (room.hostId === userId && room.hostTimer) {
      clearTimeout(room.hostTimer);
      room.hostTimer = null;
    }
    // a host-less (all disconnected) room regains a host when someone comes back
    const host = room.members.get(room.hostId);
    if (!host || host.conns.size === 0) {
      if (!room.hostTimer) this.scheduleHostMigration(room);
    }
    room.lastActivity = this.now();
    this.broadcast(room);
    this.lobbyChanged();
  }

  /** Socket closed or switched rooms. Membership persists so the player can reconnect. */
  unsubscribe(conn: Conn) {
    this.lobbyConns.delete(conn);
    const room = conn.roomId ? this.rooms.get(conn.roomId) : undefined;
    conn.roomId = null;
    if (!room) return;
    room.conns.delete(conn);
    const member = conn.userId ? room.members.get(conn.userId) : undefined;
    if (!member) return;
    member.conns.delete(conn);
    if (member.conns.size === 0) {
      member.disconnectedAt = this.now();
      if (room.hostId === member.userId) this.scheduleHostMigration(room);
      if (this.connectedCount(room) === 0) room.emptySince = this.now();
      // a disconnect may complete the "everyone answered" condition
      if (room.match?.phase === 'question') this.maybeCloseEarly(room);
    }
    this.broadcast(room);
    this.lobbyChanged();
  }

  private scheduleHostMigration(room: Room) {
    if (room.hostTimer) clearTimeout(room.hostTimer);
    room.hostTimer = setTimeout(() => {
      room.hostTimer = null;
      const host = room.members.get(room.hostId);
      if (room.status === 'closed' || (host && host.conns.size > 0)) return;
      if (this.connectedCount(room) === 0) return; // nobody to hand over to yet
      this.migrateHost(room);
      this.broadcast(room);
      this.lobbyChanged();
    }, this.cfg.timings.hostGraceMs);
    room.hostTimer.unref?.();
  }

  private memberRoom(userId: string): Room {
    const id = this.userRoom.get(userId);
    const room = id ? this.rooms.get(id) : undefined;
    if (!room) throw notFound('You are not in a room');
    return room;
  }

  private hostRoom(userId: string): Room {
    const room = this.memberRoom(userId);
    if (room.hostId !== userId) throw forbidden('Only the host can do that');
    return room;
  }

  private updateSettings(userId: string, msg: Extract<ClientMessage, { type: 'room.settings' }>) {
    const room = this.hostRoom(userId);
    if (room.status === 'in_progress' || room.starting) throw conflict('Settings are locked during a battle');
    const settings = validateSettings(msg.settings, this.cfg.limits);
    if (!settings.ok) throw badRequest(settings.error);
    if (settings.value.maxPlayers < room.members.size) throw badRequest('Max players is below the current player count');
    let name = room.name;
    if (msg.name !== undefined) {
      const v = validateRoomName(msg.name);
      if (!v.ok) throw badRequest(v.error);
      name = v.value;
    }
    if (msg.isPublic !== undefined && typeof msg.isPublic !== 'boolean') throw badRequest('isPublic must be boolean');
    room.settings = settings.value;
    room.name = name;
    if (typeof msg.isPublic === 'boolean') room.isPublic = msg.isPublic;
    room.lastActivity = this.now();
    this.track(
      this.db.query(`update rooms set settings = $2::jsonb, name = $3, is_public = $4, last_activity_at = now() where id = $1`, [
        room.id,
        JSON.stringify(room.settings),
        room.name,
        room.isPublic,
      ]),
    );
    this.broadcast(room);
    this.lobbyChanged();
  }

  // ---------------------------------------------------------------- match lifecycle

  async startMatch(userId: string) {
    const room = this.hostRoom(userId);
    if (room.status === 'in_progress' || room.starting) throw conflict('Battle already started');
    const participants = [...room.members.values()].filter((m) => m.conns.size > 0);
    if (participants.length < this.cfg.minPlayersToStart) {
      throw conflict(`Need at least ${this.cfg.minPlayersToStart} connected players to start`);
    }
    room.starting = true;
    try {
      const picked = await pickQuestions(this.db, room.settings);
      if (picked.length === 0) throw conflict('No questions available');
      const questions: LiveQuestion[] = picked.map((q) => {
        // shuffle options per match so answer positions cannot be memorised
        const order = [0, 1, 2, 3];
        for (let i = order.length - 1; i > 0; i--) {
          const j = randomInt(0, i + 1);
          [order[i], order[j]] = [order[j], order[i]];
        }
        return {
          questionId: q.id,
          text: q.question,
          options: order.map((o) => q.options[o]),
          correctIndex: order.indexOf(q.correct_index),
          explanation: q.explanation,
          category: q.category,
          difficulty: q.difficulty,
          order,
        } as LiveQuestion & { order: number[] };
      });

      const matchId = await this.db.transaction(async (tx) => {
        const m = await tx.query<{ id: string }>(
          `insert into matches (room_id, settings, player_count) values ($1,$2::jsonb,$3) returning id`,
          [room.id, JSON.stringify(room.settings), participants.length],
        );
        const id = m.rows[0].id;
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i] as LiveQuestion & { order: number[] };
          await tx.query(
            `insert into match_questions (match_id, idx, question_id, option_order, correct_index) values ($1,$2,$3,$4,$5)`,
            [id, i, q.questionId, q.order, q.correctIndex],
          );
        }
        await tx.query(`update rooms set status = 'in_progress', last_activity_at = now() where id = $1`, [room.id]);
        return id;
      });

      if (room.status === 'closed') return;
      const scores = new Map<string, PlayerScore>();
      for (const p of participants) {
        scores.set(p.userId, {
          userId: p.userId,
          username: p.username,
          avatar: p.avatar,
          joinedAt: p.joinedAt,
          score: 0,
          correct: 0,
          answered: 0,
          streak: 0,
          totalResponseMs: 0,
        });
      }
      const now = this.now();
      room.match = {
        id: matchId,
        settings: room.settings,
        questions,
        phase: 'countdown',
        index: -1,
        phaseEndsAt: now + this.cfg.timings.countdownMs,
        openedAt: 0,
        closesAt: 0,
        answers: questions.map(() => new Map()),
        scores,
        reveal: null,
        standings: null,
        timer: null,
      };
      room.status = 'in_progress';
      room.lastActivity = now;
      this.schedule(room, this.cfg.timings.countdownMs, () => this.openQuestion(room, 0));
      this.log(`room ${room.code}: battle started with ${participants.length} players, ${questions.length} questions`);
      this.broadcast(room);
      this.lobbyChanged();
    } finally {
      room.starting = false;
    }
  }

  private schedule(room: Room, ms: number, fn: () => void) {
    const match = room.match!;
    if (match.timer) clearTimeout(match.timer);
    match.timer = setTimeout(() => {
      match.timer = null;
      if (room.match !== match || room.status === 'closed') return;
      fn();
    }, Math.max(0, ms));
  }

  private openQuestion(room: Room, index: number) {
    const match = room.match!;
    const now = this.now();
    const durationMs = match.settings.timerSeconds * 1000;
    match.phase = 'question';
    match.index = index;
    match.openedAt = now;
    match.closesAt = now + durationMs;
    match.phaseEndsAt = match.closesAt;
    match.reveal = null;
    room.lastActivity = now;
    this.track(
      this.db.query('update match_questions set opened_at = $3, closes_at = $4 where match_id = $1 and idx = $2', [
        match.id,
        index,
        new Date(match.openedAt).toISOString(),
        new Date(match.closesAt).toISOString(),
      ]),
    );
    this.schedule(room, durationMs + this.cfg.timings.answerGraceMs, () => this.closeQuestion(room, index));
    this.broadcast(room);
  }

  submitAnswer(userId: string, questionIndex: unknown, choice: unknown) {
    const room = this.memberRoom(userId);
    const match = room.match;
    const now = this.now();
    if (!match || room.status !== 'in_progress') throw conflict('No battle in progress');
    if (!Number.isInteger(questionIndex) || !Number.isInteger(choice)) throw badRequest('Invalid answer');
    const q = match.questions[match.index];
    if (match.phase !== 'question' || questionIndex !== match.index || !q) throw conflict('This question is closed');
    const score = match.scores.get(userId);
    if (!score) throw forbidden('You are not a participant in this battle');
    if ((choice as number) < 0 || (choice as number) >= q.options.length) throw badRequest('Invalid option');
    if (now > match.closesAt + this.cfg.timings.answerGraceMs) throw conflict('Too late - time is up');
    const answers = match.answers[match.index];
    if (answers.has(userId)) throw conflict('Answer already locked in');

    const durationMs = match.settings.timerSeconds * 1000;
    const responseMs = Math.min(Math.max(0, now - match.openedAt), durationMs);
    const correct = choice === q.correctIndex;
    const result = scoreAnswer({ correct, responseMs, durationMs, previousStreak: score.streak });
    const rec: AnswerRec = {
      choice: choice as number,
      correct,
      responseMs,
      points: result.points,
      speedBonus: result.speedBonus,
      streakBonus: result.streakBonus,
    };
    // recorded synchronously: any concurrent duplicate is rejected by the has() check above
    answers.set(userId, rec);
    score.answered += 1;
    score.score += result.points;
    score.streak = result.streak;
    if (correct) {
      score.correct += 1;
      score.totalResponseMs += responseMs;
    }
    const index = match.index;
    this.track(
      this.db.query(
        `insert into answers (match_id, idx, user_id, choice, is_correct, response_ms, points, speed_bonus, streak_bonus)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [match.id, index, userId, rec.choice, correct, responseMs, rec.points, rec.speedBonus, rec.streakBonus],
      ),
    );
    this.broadcast(room);
    this.maybeCloseEarly(room);
    // correctness is deliberately NOT returned until the round closes
    return { accepted: true, questionIndex: index, choice: rec.choice };
  }

  private maybeCloseEarly(room: Room) {
    const match = room.match;
    if (!match || match.phase !== 'question') return;
    const answers = match.answers[match.index];
    const connected = [...match.scores.keys()].filter((id) => (room.members.get(id)?.conns.size ?? 0) > 0);
    // if nobody is connected the round simply runs out, so a brief network blip doesn't skip questions
    if (connected.length > 0 && connected.every((id) => answers.has(id))) {
      const index = match.index;
      this.schedule(room, 0, () => this.closeQuestion(room, index));
    }
  }

  private closeQuestion(room: Room, index: number) {
    const match = room.match!;
    if (match.phase !== 'question' || match.index !== index) return;
    const q = match.questions[index];
    const answers = match.answers[index];
    const results: RevealResult[] = [];
    for (const s of match.scores.values()) {
      const a = answers.get(s.userId);
      if (!a) s.streak = 0;
      results.push({
        userId: s.userId,
        choice: a?.choice ?? null,
        correct: a?.correct ?? false,
        points: a?.points ?? 0,
        speedBonus: a?.speedBonus ?? 0,
        streakBonus: a?.streakBonus ?? 0,
        responseMs: a?.responseMs ?? null,
      });
    }
    const now = this.now();
    match.phase = 'reveal';
    match.reveal = { index, correctIndex: q.correctIndex, explanation: q.explanation, results };
    match.phaseEndsAt = now + this.cfg.timings.revealMs;
    this.track(this.db.query('update match_questions set closed_at = now() where match_id = $1 and idx = $2', [match.id, index]));
    const next = index + 1;
    this.schedule(room, this.cfg.timings.revealMs, () => {
      if (next < match.questions.length) this.openQuestion(room, next);
      else void this.finishMatch(room);
    });
    this.broadcast(room);
  }

  private async finishMatch(room: Room) {
    const match = room.match!;
    if (match.phase === 'finished') return;
    const ranked = rankPlayers([...match.scores.values()]);
    const playerCount = ranked.length;
    const standings: FinalStanding[] = ranked.map((p) => ({
      userId: p.userId,
      username: p.username,
      avatar: p.avatar,
      rank: p.rank,
      score: p.score,
      correct: p.correct,
      xpGained: xpForMatch(p.score, p.rank === 1, playerCount),
    }));
    match.phase = 'finished';
    match.standings = standings;
    match.phaseEndsAt = this.now();
    match.reveal = null;
    room.status = 'finished';
    room.lastActivity = this.now();
    this.broadcast(room);
    this.lobbyChanged();
    this.log(`room ${room.code}: battle finished, winner ${standings[0]?.username}`);

    const questionCount = match.questions.length;
    try {
      await this.persistResults(room, match, standings, questionCount);
    } catch (e) {
      console.error('[engine] failed to persist match results', e);
      return;
    }
    // refresh levels shown in the lobby after XP was granted
    for (const s of standings) {
      const m = room.members.get(s.userId);
      if (!m) continue;
      const p = await getProfile(this.db, s.userId);
      if (p) m.level = levelForXp(p.xp);
    }
    this.broadcast(room);
  }

  private persistResults(room: Room, match: LiveMatch, standings: FinalStanding[], questionCount: number) {
    const playerCount = standings.length;
    return this.track(
      this.db.transaction(async (tx) => {
        await tx.query(`update matches set status = 'finished', finished_at = now(), winner_id = $2 where id = $1`, [
          match.id,
          playerCount > 0 ? standings[0].userId : null,
        ]);
        for (const s of standings) {
          const ps = match.scores.get(s.userId)!;
          const won = s.rank === 1 && playerCount > 1;
          const lost = !won && playerCount > 1;
          await tx.query(
            `insert into leaderboard_entries (user_id, match_id, room_name, points, correct, question_count, rank, player_count, won, xp_gained)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (user_id, match_id) do nothing`,
            [s.userId, match.id, room.name, s.score, s.correct, questionCount, s.rank, playerCount, won, s.xpGained],
          );
          await tx.query(
            `insert into player_stats as ps (user_id, matches_played, wins, losses, total_points, questions_faced,
                                             questions_answered, correct_answers, current_win_streak, best_win_streak, highest_score)
             values ($1, 1, $2::int, $3::int, $4::int, $5::int, $6::int, $7::int, $2::int, $2::int, $4::int)
             on conflict (user_id) do update set
               matches_played     = ps.matches_played + 1,
               wins               = ps.wins + excluded.wins,
               losses             = ps.losses + excluded.losses,
               total_points       = ps.total_points + excluded.total_points,
               questions_faced    = ps.questions_faced + excluded.questions_faced,
               questions_answered = ps.questions_answered + excluded.questions_answered,
               correct_answers    = ps.correct_answers + excluded.correct_answers,
               current_win_streak = case when excluded.wins = 1 then ps.current_win_streak + 1
                                         when excluded.losses = 1 then 0 else ps.current_win_streak end,
               best_win_streak    = greatest(ps.best_win_streak,
                                         case when excluded.wins = 1 then ps.current_win_streak + 1 else 0 end),
               highest_score      = greatest(ps.highest_score, excluded.highest_score),
               updated_at         = now()`,
            [s.userId, won ? 1 : 0, lost ? 1 : 0, s.score, questionCount, ps.answered, s.correct],
          );
          await tx.query('update profiles set xp = xp + $2, updated_at = now() where id = $1', [s.userId, s.xpGained]);
        }
        await tx.query(`update rooms set status = 'finished', last_activity_at = now() where id = $1`, [room.id]);
      }),
    );
  }

  // ---------------------------------------------------------------- housekeeping

  private sweep() {
    const now = this.now();
    const t = this.cfg.timings;
    for (const room of [...this.rooms.values()]) {
      if (room.status === 'in_progress') continue;
      for (const m of [...room.members.values()]) {
        if (m.conns.size === 0 && m.disconnectedAt && now - m.disconnectedAt > t.lobbyDisconnectTtlMs) {
          this.removeMember(room, m.userId, 'expired');
        }
      }
      if (!this.rooms.has(room.id)) continue;
      const empty = this.connectedCount(room) === 0;
      if ((empty && room.emptySince === null) || room.members.size === 0) room.emptySince ??= now;
      if (
        room.members.size === 0 ||
        (empty && room.emptySince !== null && now - room.emptySince > t.emptyRoomTtlMs) ||
        now - room.lastActivity > t.idleRoomTtlMs
      ) {
        this.closeRoom(room);
      }
    }
  }

  private lobbyChanged() {
    if (this.lobbyTimer || this.lobbyConns.size === 0) return;
    this.lobbyTimer = setTimeout(() => {
      this.lobbyTimer = null;
      const rooms = this.listPublicRooms();
      for (const c of this.lobbyConns) send(c, { type: 'lobby.rooms', rooms });
    }, 250);
  }

  private broadcast(room: Room) {
    for (const conn of room.conns) send(conn, { type: 'room.state', room: this.snapshot(room, conn.userId!) });
  }

  // ---------------------------------------------------------------- views (never leak answers)

  snapshot(room: Room, forUserId: string): RoomSnapshot {
    const match = room.match;
    const openAnswers = match && match.phase === 'question' ? match.answers[match.index] : null;
    const players: PublicPlayer[] = [...room.members.values()].map((m) => {
      const s = match?.scores.get(m.userId);
      return {
        userId: m.userId,
        username: m.username,
        avatar: m.avatar,
        level: m.level,
        isHost: m.userId === room.hostId,
        connected: m.conns.size > 0,
        score: s?.score ?? 0,
        correct: s?.correct ?? 0,
        streak: s?.streak ?? 0,
        answered: openAnswers?.has(m.userId) ?? false,
        joinedAt: m.joinedAt,
      };
    });
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      hostId: room.hostId,
      status: room.status === 'closed' ? 'finished' : room.status,
      settings: room.settings,
      players,
      match: match ? this.matchView(match, forUserId) : null,
      serverNow: this.now(),
    };
  }

  private matchView(match: LiveMatch, forUserId: string): MatchSnapshot {
    const q = match.index >= 0 ? match.questions[match.index] : null;
    const showQuestion = q && (match.phase === 'question' || match.phase === 'reveal');
    const mine = match.index >= 0 ? match.answers[match.index]?.get(forUserId) : undefined;
    return {
      id: match.id,
      phase: match.phase,
      questionIndex: match.index,
      questionCount: match.questions.length,
      timerSeconds: match.settings.timerSeconds,
      phaseEndsAt: match.phaseEndsAt,
      question: showQuestion
        ? {
            index: match.index,
            text: q.text,
            options: q.options,
            category: q.category,
            difficulty: q.difficulty,
            openedAt: match.openedAt,
            closesAt: match.closesAt,
          }
        : null,
      // correctIndex/explanation only exist on the reveal object, built when the round closes
      reveal: match.phase === 'reveal' ? match.reveal : null,
      myAnswer: mine && match.phase !== 'finished' ? { index: match.index, choice: mine.choice } : null,
      standings: match.phase === 'finished' ? match.standings : null,
    };
  }
}
