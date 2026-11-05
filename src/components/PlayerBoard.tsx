import type { PublicPlayer } from '../../shared/protocol';
import { Avatar } from './Avatar';

/** Live leaderboard used inside the arena. Scores come straight from server snapshots. */
export function PlayerBoard({
  players,
  meId,
  phase,
  revealPoints,
}: {
  players: PublicPlayer[];
  meId: string;
  phase: string;
  revealPoints?: Map<string, number>;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score || b.correct - a.correct || a.joinedAt - b.joinedAt);
  return (
    <ol className="space-y-1.5" aria-label="Live leaderboard">
      {sorted.map((p, i) => {
        const gained = revealPoints?.get(p.userId);
        return (
          <li
            key={p.userId}
            className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-all duration-500 ${
              p.userId === meId ? 'border-volt-400/60 bg-volt-500/10' : 'border-white/5 bg-white/[0.02]'
            }`}
          >
            <span
              className={`w-6 text-center font-display text-sm font-black ${
                i === 0 ? 'text-aura-300' : i === 1 ? 'text-slate-200' : i === 2 ? 'text-orange-300' : 'text-slate-500'
              }`}
            >
              {i + 1}
            </span>
            <span className="relative">
              <Avatar id={p.avatar} size={30} dim={!p.connected} ring={i === 0 && p.score > 0 ? 'gold' : undefined} />
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-void-900 ${p.connected ? 'bg-emerald-400' : 'bg-slate-500'}`}
                title={p.connected ? 'Connected' : 'Disconnected'}
              />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold">
              {p.isHost ? <span title="Host">👑 </span> : null}
              {p.username}
              {p.streak >= 2 ? <span className="ml-1 text-xs text-orange-300" title={`${p.streak} correct in a row`}>🔥{p.streak}</span> : null}
            </span>
            {phase === 'question' ? (
              <span className={`text-xs font-bold ${p.answered ? 'text-emerald-400' : 'text-slate-600'}`} aria-label={p.answered ? 'answered' : 'thinking'}>
                {p.answered ? '✓' : '…'}
              </span>
            ) : null}
            {gained !== undefined && gained > 0 ? <span className="animate-burst text-xs font-bold text-aura-300">+{gained}</span> : null}
            <span className="w-14 text-right font-display text-sm font-bold text-volt-300">{p.score}</span>
          </li>
        );
      })}
    </ol>
  );
}
