import { Chip } from './ui';
import type { MatchHistoryItem } from '../../shared/protocol';

export function HistoryTable({ items }: { items: MatchHistoryItem[] }) {
  if (!items.length) return <p className="py-4 text-center text-slate-400">No battles fought yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-slate-400">
          <tr>
            <th className="py-2">Result</th>
            <th>Arena</th>
            <th className="text-right">Place</th>
            <th className="text-right">Correct</th>
            <th className="text-right">Score</th>
            <th className="text-right">When</th>
          </tr>
        </thead>
        <tbody>
          {items.map((h) => (
            <tr key={h.matchId} className="border-t border-white/5">
              <td className="py-2">
                {h.won ? <Chip tone="aura">Victory</Chip> : h.playerCount === 1 ? <Chip tone="slate">Solo</Chip> : <Chip tone="blood">Defeat</Chip>}
              </td>
              <td className="font-semibold">{h.roomName}</td>
              <td className="text-right">
                #{h.rank} / {h.playerCount}
              </td>
              <td className="text-right">
                {h.correct}/{h.questionCount}
              </td>
              <td className="text-right font-display font-bold text-aura-300">{h.score}</td>
              <td className="text-right text-slate-400">{new Date(h.finishedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
