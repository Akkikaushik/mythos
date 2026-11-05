import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { backend } from '../lib/api';
import type { Profile, RoomSnapshot } from '../../shared/protocol';
import type { AvatarId } from '../../shared/rules';

interface AuthState {
  profile: Profile | null;
  currentRoom: RoomSnapshot | null;
  loading: boolean;
  register(username: string, password: string, avatar: AvatarId): Promise<void>;
  login(username: string, password: string): Promise<void>;
  guest(): Promise<void>;
  logout(): void;
  refresh(): Promise<void>;
  setProfile(p: Profile): void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentRoom, setCurrentRoom] = useState<RoomSnapshot | null>(null);
  const [loading, setLoading] = useState(backend.hasSession());

  const logout = useCallback(() => {
    backend.logout();
    setProfile(null);
    setCurrentRoom(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!backend.hasSession()) {
      setLoading(false);
      return;
    }
    try {
      const me = await backend.me();
      setProfile(me.profile);
      setCurrentRoom(me.currentRoom);
    } catch (e) {
      if ((e as { status?: number }).status === 401) logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    void refresh();
    const onInvalid = () => logout();
    window.addEventListener('mythos:session-invalid', onInvalid);
    return () => window.removeEventListener('mythos:session-invalid', onInvalid);
  }, [refresh, logout]);

  const value = useMemo<AuthState>(
    () => ({
      profile,
      currentRoom,
      loading,
      async register(u, p, a) {
        setProfile((await backend.register(u, p, a)).profile);
      },
      async login(u, p) {
        setProfile((await backend.login(u, p)).profile);
        await refresh();
      },
      async guest() {
        setProfile((await backend.guest()).profile);
      },
      logout,
      refresh,
      setProfile,
    }),
    [profile, currentRoom, loading, logout, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
