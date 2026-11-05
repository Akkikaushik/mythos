import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { backend } from '../lib/api';
import { useAuth } from '../state/auth';
import { Avatar, RankBadge } from '../components/Avatar';
import { ErrorNote, PageTitle, Panel, Spinner } from '../components/ui';
import type { LeaderboardPeriod, LeaderboardRow } from '../../shared/protocol';

const PERIODS: { id: LeaderboardPeriod; label: string; hint: string }[] = [
  { id: 'daily', label: 'Daily', hint: 'Since 00:00 UTC today' },
  { id: 'weekly', label: 'Weekly', hint: 'Since Monday 00:00 UTC' },
  { id: 'all', label: 'All-time', hint: 'Every battle ever fought' },
];

export default function Leaderboard() {
  const { profile } = useAuth();
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    backend
      .leaderboard(period)
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, [period]);

  return (
    <div>
      <PageTitle kicker="HALL OF LEGENDS" title="Global rankings">
        {PERIODS.find((p) => p.id === period)?.hint}. Ranked by points earned in battle.
      </PageTitle>
      <div className="mb-4 flex gap-2" role="tablist">
        {PERIODS.map((p) => (
          <button key={p.id} role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)} className={`nav-link ${period === p.id ? 'active' : ''}`}>
            {p.label}
          </button>
        ))}
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel>
        {!rows ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-slate-400">No battles in this period yet. Be the first legend.</p>
        ) : (
          <ol className="space-y-1.5">
            {rows.map((r) => (
              <li
                key={r.userId}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                  r.userId === profile?.id ? 'border-volt-400/60 bg-volt-500/10' : 'border-white/5 bg-white/[0.02]'
                }`}
              >
                <span
                  className={`w-8 text-center font-display text-lg font-black ${
                    r.rank === 1 ? 'text-aura-300' : r.rank === 2 ? 'text-slate-200' : r.rank === 3 ? 'text-orange-300' : 'text-slate-500'
                  }`}
                >
                  {r.rank}
                </span>
                <Avatar id={r.avatar} size={36} ring={r.rank === 1 ? 'gold' : undefined} />
                <Link to={`/player/${r.userId}`} className="min-w-0 flex-1 truncate font-bold hover:text-volt-300">
                  {r.username}
                </Link>
                <span className="hidden sm:inline">
                  <RankBadge level={r.level} />
                </span>
                <span className="hidden w-24 text-right text-sm text-slate-400 sm:inline">
                  {r.wins}W / {r.matches} battles
                </span>
                <span className="w-20 text-right font-display font-bold text-aura-300">{r.points.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
