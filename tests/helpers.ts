import WebSocket from 'ws';
import { startServer, type RunningServer } from '../server/src/app';
import { DEFAULT_LIMITS } from '../shared/rules';
import type { ServerConfig } from '../server/src/config';
import type { AuthResponse, PublicRoomInfo, RoomSnapshot, ServerMessage } from '../shared/protocol';

export function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    dataDir: null,
    staticDir: null,
    limits: { ...DEFAULT_LIMITS, minTimer: 1 },
    timings: {
      countdownMs: 150,
      revealMs: 150,
      answerGraceMs: 100,
      hostGraceMs: 300,
      lobbyDisconnectTtlMs: 60_000,
      emptyRoomTtlMs: 60_000,
      idleRoomTtlMs: 60 * 60_000,
      cleanupIntervalMs: 100,
    },
    minPlayersToStart: 1,
    corsOrigins: [],
    log: false,
    rateLimits: false,
    ...overrides,
  };
}

export const boot = (o?: Partial<ServerConfig>): Promise<RunningServer> => startServer(testConfig(o));

export async function api<T = unknown>(
  base: string,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: T & { error?: string } }> {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T & { error?: string } };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let seq = 0;

/** A simulated player: real HTTP + real WebSocket against the running server. */
export class Player {
  ws: WebSocket | null = null;
  room: RoomSnapshot | null = null;
  lobbyRooms: PublicRoomInfo[] = [];
  removed: string | null = null;
  messages: ServerMessage[] = [];
  private acks = new Map<string, (m: Extract<ServerMessage, { type: 'ack' }>) => void>();
  private listeners = new Set<() => void>();

  constructor(
    readonly base: string,
    readonly token: string,
    readonly userId: string,
    readonly username: string,
  ) {}

  static async register(base: string, username: string): Promise<Player> {
    const { status, data } = await api<AuthResponse>(base, 'POST', '/api/auth/register', {
      username,
      password: 'correct-horse-battery',
      avatar: 'kitsune',
    });
    if (status !== 200) throw new Error(`register ${username}: ${status} ${data.error}`);
    return new Player(base, data.token, data.profile.id, data.profile.username);
  }

  call<T = unknown>(method: string, path: string, body?: unknown) {
    return api<T>(this.base, method, path, body, this.token);
  }

  async connect(): Promise<void> {
    const ws = new WebSocket(this.base.replace('http', 'ws') + '/ws');
    this.ws = ws;
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      this.messages.push(msg);
      if (msg.type === 'ack') this.acks.get(msg.id)?.(msg);
      if (msg.type === 'room.state') this.room = msg.room;
      if (msg.type === 'room.removed') {
        this.removed = msg.reason;
        this.room = null;
      }
      if (msg.type === 'lobby.rooms') this.lobbyRooms = msg.rooms;
      for (const l of this.listeners) l();
    });
    await new Promise<void>((res, rej) => {
      ws.once('open', () => res());
      ws.once('error', rej);
    });
    const ack = await this.send({ type: 'auth', token: this.token });
    if (!ack.ok) throw new Error('auth failed');
  }

  send(msg: Record<string, unknown>): Promise<Extract<ServerMessage, { type: 'ack' }>> {
    const id = `m${++seq}`;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`no ack for ${String(msg.type)}`)), 5000);
      this.acks.set(id, (m) => {
        clearTimeout(t);
        this.acks.delete(id);
        resolve(m);
      });
      this.ws!.send(JSON.stringify({ ...msg, id }));
    });
  }

  waitFor(pred: (room: RoomSnapshot) => boolean, label = 'condition', timeout = 10_000): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.room && pred(this.room)) {
          cleanup();
          resolve(this.room);
        }
      };
      const t = setTimeout(() => {
        cleanup();
        reject(new Error(`${this.username}: timed out waiting for ${label}; phase=${this.room?.match?.phase}`));
      }, timeout);
      const cleanup = () => {
        clearTimeout(t);
        this.listeners.delete(check);
      };
      this.listeners.add(check);
      check();
    });
  }

  disconnect(): Promise<void> {
    const ws = this.ws;
    this.ws = null;
    if (!ws || ws.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((r) => {
      ws.once('close', () => r());
      ws.close();
    });
  }
}
