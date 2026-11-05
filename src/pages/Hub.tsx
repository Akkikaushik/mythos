import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { backend } from '../lib/api';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';
import { usePublicRooms } from '../hooks/useRealtime';
import { Avatar, RankBadge } from '../components/Avatar';
import { RoomList } from '../components/RoomList';
import { useJoin } from '../hooks/useJoin';
import { Button, Panel, Stat } from '../components/ui';
import { levelProgress, normalizeRoomCode } from '../../shared/rules';
import type { PlayerStats } from '../../shared/protocol';

export default function Hub() {
  const { profile, currentRoom, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { rooms } = usePublicRooms();
  const { join, busy } = useJoin();
  const [code, setCode] = useState('');
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [qp, setQp] = useState(false);

  useEffect(() => {
    void refresh();
    if (profile) backend.player(profile.id).then((r) => setStats(r.stats)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  if (!profile) return null;
  const lp = levelProgress(profile.xp);

  const quickPlay = async () => {
    setQp(true);
    try {
      const room = await backend.quickPlay();
      navigate(`/room/${room.id}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setQp(false);
    }
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    const c = normalizeRoomCode(code);
    if (c.length !== 6) return toast('Room codes are 6 characters', 'error');
    void join({ code: c });
  };

  return (
    <div className="space-y-6">
      {currentRoom ? (
        <Panel glow="gold" className="flex flex-wrap items-center justify-between gap-3 animate-rise">
          <div>
            <p className="font-display text-xs tracking-[0.3em] text-aura-300">YOU ARE STILL IN A ROOM</p>
            <p className="text-lg font-bold">
              {currentRoom.name} · {currentRoom.status === 'in_progress' ? 'battle in progress' : 'waiting'}
            </p>
          </div>
          <Button variant="gold" onClick={() => navigate(`/room/${currentRoom.id}`)}>
            Rejoin
          </Button>
        </Panel>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Panel className="animate-rise">
          <div className="flex items-center gap-4">
            <Avatar id={profile.avatar} size={84} ring="gold" />
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-black">{profile.username}</h1>
              <RankBadge level={lp.level} />
              <div className="mt-2 h-2 w-48 overflow-hidden rounded-full bg-white/10" aria-label="XP progress">
                <div className="h-full bg-gradient-to-r from-arcane-500 to-volt-400" style={{ width: `${lp.pct * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {lp.current} / {lp.needed} XP to level {lp.level + 1}
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <Stat label="Battles" value={stats?.matchesPlayed ?? '–'} />
            <Stat label="Wins" value={stats?.wins ?? '–'} tone="aura" />
            <Stat label="Accuracy" value={stats ? `${Math.round(stats.accuracy * 100)}%` : '–'} tone="arcane" />
          </div>
          <Link to="/profile" className="mt-4 inline-block text-sm font-semibold text-volt-300 hover:underline">
            View full profile →
          </Link>
        </Panel>

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={quickPlay}
            disabled={qp}
            className="panel panel-gold group flex flex-col items-start justify-between gap-6 text-left transition hover:-translate-y-1 hover:shadow-glow-gold disabled:opacity-60 sm:col-span-2"
          >
            <span className="font-display text-xs tracking-[0.35em] text-aura-300">MATCHMAKING</span>
            <span className="font-display text-3xl font-black uppercase">{qp ? 'Finding an arena…' : '⚡ Quick Play'}</span>
            <span className="text-slate-300">Jump straight into an open public arena, or open a new one if none are waiting.</span>
          </button>
          <Link to="/create" className="panel flex flex-col gap-2 transition hover:-translate-y-1 hover:shadow-glow">
            <span className="font-display text-xl font-black uppercase text-volt-300">✦ Create room</span>
            <span className="text-sm text-slate-300">Private or public. Pick realms, difficulty and timer.</span>
          </Link>
          <Panel>
            <form onSubmit={submitCode} className="flex flex-col gap-2">
              <label htmlFor="hub-code" className="font-display text-xl font-black uppercase text-arcane-400">
                ⌘ Join by code
              </label>
              <div className="flex gap-2">
                <input
                  id="hub-code"
                  className="input font-display uppercase tracking-[0.3em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="K7QX2M"
                  maxLength={8}
                  autoComplete="off"
                />
                <Button type="submit" loading={busy === 'join'}>
                  Go
                </Button>
              </div>
            </form>
          </Panel>
        </div>
      </div>

      <Panel>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold uppercase tracking-widest text-volt-300">Open arenas</h2>
          <Link to="/rooms" className="text-sm font-semibold text-volt-300 hover:underline">
            Browse all →
          </Link>
        </div>
        <RoomList rooms={rooms} limit={5} />
      </Panel>
    </div>
  );
}
