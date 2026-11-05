import type {
  AuthResponse,
  ClientMessage,
  LeaderboardPeriod,
  LeaderboardRow,
  MatchHistoryItem,
  PlayerStats,
  Profile,
  PublicRoomInfo,
  RoomSnapshot,
} from '../../../shared/protocol';
import type { AvatarId, GameSettings } from '../../../shared/rules';

export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface Ack {
  ok: boolean;
  error?: string;
  data?: unknown;
}

type Outgoing = ClientMessage extends infer M ? (M extends { type: 'auth' | 'ping' } ? never : Omit<M, 'id'>) : never;

/** Realtime channel: authoritative room state pushes, lobby updates, and game actions. */
export interface RealtimeClient {
  status(): ConnectionStatus;
  onStatus(cb: (s: ConnectionStatus) => void): () => void;
  /** estimated (serverClock - localClock) in ms */
  clockOffset(): number;
  send(msg: Outgoing): Promise<Ack>;
  subscribeRoom(
    roomId: string,
    handlers: { onState: (room: RoomSnapshot) => void; onRemoved: (reason: string) => void; onError: (e: string) => void },
  ): () => void;
  subscribeLobby(onRooms: (rooms: PublicRoomInfo[]) => void): () => void;
}

/**
 * Everything the UI needs from a backend. `local` (Node + PGlite + WebSocket) is
 * implemented today; a `supabase` adapter can implement the same interface later.
 */
export interface Backend {
  readonly kind: 'local' | 'supabase';
  hasSession(): boolean;
  register(username: string, password: string, avatar: AvatarId): Promise<AuthResponse>;
  login(username: string, password: string): Promise<AuthResponse>;
  guest(): Promise<AuthResponse>;
  logout(): void;
  me(): Promise<{ profile: Profile; currentRoom: RoomSnapshot | null }>;
  updateProfile(patch: { username?: string; avatar?: AvatarId }): Promise<Profile>;
  player(id: string): Promise<{ profile: Profile; stats: PlayerStats; history: MatchHistoryItem[] }>;
  history(): Promise<MatchHistoryItem[]>;
  leaderboard(period: LeaderboardPeriod): Promise<LeaderboardRow[]>;
  publicRooms(): Promise<PublicRoomInfo[]>;
  createRoom(input: { name: string; isPublic: boolean; settings: GameSettings }): Promise<RoomSnapshot>;
  joinRoom(input: { code: string } | { roomId: string }): Promise<RoomSnapshot>;
  quickPlay(): Promise<RoomSnapshot>;
  realtime: RealtimeClient;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
