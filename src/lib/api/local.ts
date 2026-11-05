import { estimateClockOffset } from '../../../shared/rules';
import type {
  AuthResponse,
  LeaderboardPeriod,
  LeaderboardRow,
  MatchHistoryItem,
  PlayerStats,
  Profile,
  PublicRoomInfo,
  RoomSnapshot,
  ServerMessage,
} from '../../../shared/protocol';
import { ApiError, type Ack, type Backend, type ConnectionStatus, type RealtimeClient } from './types';

const TOKEN_KEY = 'mythos.session';

class LocalRealtime implements RealtimeClient {
  private ws: WebSocket | null = null;
  private st: ConnectionStatus = 'idle';
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private acks = new Map<string, { resolve: (a: Ack) => void; timer: number }>();
  private seq = 0;
  private retry = 0;
  private retryTimer: number | null = null;
  private pingTimer: number | null = null;
  private offset = 0;
  private bestRtt = Infinity;
  private authed = false;
  private queue: string[] = [];
  private room: { id: string; h: Parameters<RealtimeClient['subscribeRoom']>[1] } | null = null;
  private lobby = new Set<(rooms: PublicRoomInfo[]) => void>();

  constructor(
    private readonly wsUrl: string,
    private readonly getToken: () => string | null,
  ) {
    window.addEventListener('online', () => this.ensure(true));
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.ensure(true));
  }

  status() {
    return this.st;
  }
  onStatus(cb: (s: ConnectionStatus) => void) {
    this.statusListeners.add(cb);
    return () => void this.statusListeners.delete(cb);
  }
  clockOffset() {
    return this.offset;
  }

  private setStatus(s: ConnectionStatus) {
    this.st = s;
    for (const l of this.statusListeners) l(s);
  }

  /** Open the socket if needed. Safe to call repeatedly. */
  ensure(immediate = false) {
    if (!this.getToken()) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (immediate && this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.retryTimer) return;
    this.open();
  }

  disconnect() {
    this.room = null;
    this.lobby.clear();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.setStatus('idle');
  }

  private open() {
    const token = this.getToken();
    if (!token) return;
    this.setStatus(this.retry > 0 ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    this.authed = false;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token, id: 'auth' }));
    ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data as string) as ServerMessage);
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.authed = false;
      if (this.pingTimer) clearInterval(this.pingTimer);
      for (const [, a] of this.acks) {
        clearTimeout(a.timer);
        a.resolve({ ok: false, error: 'Connection lost' });
      }
      this.acks.clear();
      if (ev.code === 4003) {
        this.setStatus('offline');
        window.dispatchEvent(new CustomEvent('mythos:session-invalid'));
        return;
      }
      this.retry++;
      this.setStatus(navigator.onLine ? 'reconnecting' : 'offline');
      const delay = Math.min(8000, 400 * 2 ** Math.min(this.retry, 5)) + Math.random() * 300;
      this.retryTimer = window.setTimeout(() => {
        this.retryTimer = null;
        this.open();
      }, delay);
    };
  }

  private onMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'hello':
        this.authed = true;
        this.retry = 0;
        this.bestRtt = Infinity;
        this.setStatus('online');
        this.ping();
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = window.setInterval(() => this.ping(), 10_000);
        // resume subscriptions after (re)connect: the server replies with a full snapshot
        if (this.room) this.resubscribeRoom();
        if (this.lobby.size) this.raw({ type: 'lobby.subscribe' });
        for (const q of this.queue.splice(0)) this.ws?.send(q);
        return;
      case 'pong': {
        const now = Date.now();
        const rtt = now - msg.t;
        // keep the estimate from the lowest-latency sample (least asymmetric delay)
        if (rtt <= this.bestRtt * 1.5 || rtt < 60) {
          this.bestRtt = Math.min(this.bestRtt, rtt);
          this.offset = estimateClockOffset(msg.t, msg.serverNow, now);
        }
        return;
      }
      case 'ack': {
        const a = this.acks.get(msg.id);
        if (a) {
          clearTimeout(a.timer);
          this.acks.delete(msg.id);
          a.resolve({ ok: msg.ok, error: msg.error, data: msg.data });
        }
        return;
      }
      case 'room.state':
        if (this.room?.id === msg.room.id) this.room.h.onState(msg.room);
        return;
      case 'room.removed':
        if (this.room?.id === msg.roomId) {
          const h = this.room.h;
          this.room = null;
          h.onRemoved(msg.reason);
        }
        return;
      case 'lobby.rooms':
        for (const l of this.lobby) l(msg.rooms);
        return;
      case 'error':
        this.room?.h.onError(msg.error);
        return;
    }
  }

  private ping() {
    if (this.ws?.readyState === WebSocket.OPEN && this.authed) this.ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
  }

  private raw(msg: object) {
    const s = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN && this.authed) this.ws.send(s);
    else this.queue.push(s);
  }

  send(msg: Parameters<RealtimeClient['send']>[0]): Promise<Ack> {
    this.ensure();
    const id = `c${++this.seq}`;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.acks.delete(id);
        resolve({ ok: false, error: 'Server did not respond' });
      }, 8000);
      this.acks.set(id, { resolve, timer });
      this.raw({ ...msg, id });
    });
  }

  private resubscribeRoom() {
    const room = this.room;
    if (!room) return;
    void this.send({ type: 'room.subscribe', roomId: room.id }).then((a) => {
      if (!a.ok && this.room === room && a.error !== 'Connection lost') {
        this.room = null;
        room.h.onRemoved(a.error ?? 'unavailable');
      }
    });
  }

  subscribeRoom(roomId: string, h: Parameters<RealtimeClient['subscribeRoom']>[1]) {
    const sub = { id: roomId, h };
    this.room = sub;
    this.ensure(true);
    if (this.authed) this.resubscribeRoom();
    return () => {
      if (this.room === sub) this.room = null;
    };
  }

  subscribeLobby(onRooms: (rooms: PublicRoomInfo[]) => void) {
    this.lobby.add(onRooms);
    this.ensure(true);
    this.raw({ type: 'lobby.subscribe' });
    return () => {
      this.lobby.delete(onRooms);
      if (this.lobby.size === 0) this.raw({ type: 'lobby.unsubscribe' });
    };
  }
}

export class LocalBackend implements Backend {
  readonly kind = 'local' as const;
  readonly realtime: LocalRealtime;
  private token: string | null;

  constructor(private readonly apiUrl: string) {
    this.token = localStorage.getItem(TOKEN_KEY);
    const wsBase = apiUrl
      ? apiUrl.replace(/^http/, 'ws')
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    this.realtime = new LocalRealtime(`${wsBase}/ws`, () => this.token);
  }

  hasSession() {
    return !!this.token;
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.apiUrl + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'Cannot reach the MYTHOS server. Is it running?');
    }
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      if (res.status === 401 && this.token && !path.startsWith('/api/auth')) {
        window.dispatchEvent(new CustomEvent('mythos:session-invalid'));
      }
      throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
    }
    return data;
  }

  private setSession(r: AuthResponse) {
    this.token = r.token;
    localStorage.setItem(TOKEN_KEY, r.token);
    this.realtime.ensure(true);
    return r;
  }

  async register(username: string, password: string, avatar: string) {
    return this.setSession(await this.req<AuthResponse>('POST', '/api/auth/register', { username, password, avatar }));
  }
  async login(username: string, password: string) {
    return this.setSession(await this.req<AuthResponse>('POST', '/api/auth/login', { username, password }));
  }
  async guest() {
    return this.setSession(await this.req<AuthResponse>('POST', '/api/auth/guest'));
  }
  logout() {
    this.token = null;
    localStorage.removeItem(TOKEN_KEY);
    this.realtime.disconnect();
  }
  me() {
    return this.req<{ profile: Profile; currentRoom: RoomSnapshot | null }>('GET', '/api/me');
  }
  async updateProfile(patch: { username?: string; avatar?: string }) {
    return (await this.req<{ profile: Profile }>('PATCH', '/api/me', patch)).profile;
  }
  player(id: string) {
    return this.req<{ profile: Profile; stats: PlayerStats; history: MatchHistoryItem[] }>(
      'GET',
      `/api/players/${encodeURIComponent(id)}`,
    );
  }
  async history() {
    return (await this.req<{ history: MatchHistoryItem[] }>('GET', '/api/me/history')).history;
  }
  async leaderboard(period: LeaderboardPeriod) {
    return (await this.req<{ rows: LeaderboardRow[] }>('GET', `/api/leaderboard?period=${period}`)).rows;
  }
  async publicRooms() {
    return (await this.req<{ rooms: PublicRoomInfo[] }>('GET', '/api/rooms/public')).rooms;
  }
  async createRoom(input: object) {
    return (await this.req<{ room: RoomSnapshot }>('POST', '/api/rooms', input)).room;
  }
  async joinRoom(input: object) {
    return (await this.req<{ room: RoomSnapshot }>('POST', '/api/rooms/join', input)).room;
  }
  async quickPlay() {
    return (await this.req<{ room: RoomSnapshot }>('POST', '/api/rooms/quickplay')).room;
  }
}
