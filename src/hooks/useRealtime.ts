import { useEffect, useState } from 'react';
import { backend, type ConnectionStatus } from '../lib/api';
import type { PublicRoomInfo } from '../../shared/protocol';

export function useConnectionStatus(): ConnectionStatus {
  const [s, setS] = useState<ConnectionStatus>(backend.realtime.status());
  useEffect(() => backend.realtime.onStatus(setS), []);
  return s;
}

/** Live list of public rooms: initial HTTP fetch + WebSocket pushes. */
export function usePublicRooms() {
  const [rooms, setRooms] = useState<PublicRoomInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    backend
      .publicRooms()
      .then((r) => alive && setRooms(r))
      .catch((e: Error) => alive && setError(e.message));
    const unsub = backend.realtime.subscribeLobby((r) => alive && setRooms(r));
    return () => {
      alive = false;
      unsub();
    };
  }, []);
  return { rooms, error };
}

/** Re-render on an interval and return the server-synchronised "now". */
export function useServerNow(active: boolean, intervalMs = 100): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTick((x) => x + 1), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return Date.now() + backend.realtime.clockOffset();
}
