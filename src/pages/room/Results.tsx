import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { backend } from '../../lib/api';
import { useAuth } from '../../state/auth';
import { useToast } from '../../state/toast';
import { sfx } from '../../lib/sfx';
import { Avatar } from '../../components/Avatar';
import { Button, Panel } from '../../components/ui';
import type { RoomSnapshot } from '../../../shared/protocol';

export default function Results({
  room,
  meId,
  isHost,
  onLeave,
}: {
  room: RoomSnapshot;
  meId: string;
  isHost: boolean;
  onLeave: () => void;
}) {
  const standings = room.match!.standings!;
  const { refresh } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const mine = standings.find((s) => s.userId === meId);
  const won = mine?.rank === 1;
  const played = useRef(false);

  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (won) sfx.victory();
    else sfx.defeat();
    // XP / level changed server-side
    const t = setTimeout(() => void refresh(), 800);
    return () => clearTimeout(t);
  }, [won, refresh]);

  const podium = [standings[1], standings[0], standings[2]].filter(Boolean);
  const heights = { 1: 'h-36', 2: 'h-24', 3: 'h-16' } as Record<number, string>;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden text-center">
        {won ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 animate-pulse-glow rounded-3xl bg-aura-400/5" />
        ) : null}
        <p className="font-display text-sm tracking-[0.5em] text-volt-300">BATTLE COMPLETE</p>
        <h1
          className={`animate-burst font-display text-6xl font-black uppercase sm:text-7xl ${
            won ? 'text-aura-300 drop-shadow-[0_0_30px_rgba(255,211,77,.8)]' : 'text-slate-200'
          }`}
        >
          {won ? 'Victory' : mine ? 'Defeat' : 'Results'}
        </h1>
        {mine ? (
          <p className="mt-2 text-lg text-slate-300">
            You placed <span className="font-bold text-volt-300">#{mine.rank}</span> of {standings.length} with{' '}
            <span className="font-bold text-aura-300">{mine.score}</span> points · <span className="font-bold text-arcane-400">+{mine.xpGained} XP</span>
          </p>
        ) : null}
        <p className="mt-1 text-slate-400">
          👑 {standings[0]?.username} is the champion of {room.name}
        </p>
      </div>

      <div className="flex items-end justify-center gap-3 sm:gap-6">
        {podium.map((s) => (
          <div key={s.userId} className="flex w-28 flex-col items-center gap-2 animate-rise sm:w-36" style={{ animationDelay: `${(3 - s.rank) * 0.15}s` }}>
            <Avatar id={s.avatar} size={s.rank === 1 ? 84 : 64} ring={s.rank === 1 ? 'gold' : 'blue'} />
            <span className="max-w-full truncate font-bold">{s.username}</span>
            <span className="font-display text-lg font-black text-aura-300">{s.score}</span>
            <div
              className={`flex w-full items-start justify-center rounded-t-xl border border-b-0 pt-2 font-display text-3xl font-black ${heights[s.rank]} ${
                s.rank === 1
                  ? 'border-aura-400/60 bg-gradient-to-b from-aura-400/30 to-transparent text-aura-300'
                  : 'border-volt-400/40 bg-gradient-to-b from-volt-500/20 to-transparent text-volt-300'
              }`}
            >
              {s.rank}
            </div>
          </div>
        ))}
      </div>

      <Panel>
        <h2 className="mb-3 font-display text-lg font-bold uppercase tracking-widest text-volt-300">Final standings</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="py-2">#</th>
              <th>Warrior</th>
              <th className="text-right">Correct</th>
              <th className="text-right">XP</th>
              <th className="text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.userId} className={`border-t border-white/5 ${s.userId === meId ? 'bg-volt-500/10' : ''}`}>
                <td className="py-2 font-display font-bold">{s.rank}</td>
                <td>
                  <span className="flex items-center gap-2">
                    <Avatar id={s.avatar} size={28} />
                    <Link to={`/player/${s.userId}`} className="font-bold hover:text-volt-300">
                      {s.username}
                    </Link>
                  </span>
                </td>
                <td className="text-right">
                  {s.correct}/{room.match!.questionCount}
                </td>
                <td className="text-right text-arcane-400">+{s.xpGained}</td>
                <td className="text-right font-display font-bold text-aura-300">{s.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="flex flex-wrap justify-center gap-3">
        {isHost ? (
          <Button
            variant="gold"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const ack = await backend.realtime.send({ type: 'room.playAgain' });
              setBusy(false);
              if (!ack.ok) toast(ack.error ?? 'Could not restart', 'error');
            }}
          >
            ⚔ Battle again
          </Button>
        ) : (
          <span className="self-center font-display text-sm uppercase tracking-widest text-volt-300">Waiting for the host to start another round…</span>
        )}
        <Link to="/history" className="btn btn-ghost">
          Match history
        </Link>
        <Button variant="danger" onClick={onLeave}>
          Leave room
        </Button>
      </div>
    </div>
  );
}
