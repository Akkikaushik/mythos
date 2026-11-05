import { useJoin } from '../hooks/useJoin';
import { categoryLabel } from '../../shared/rules';
import type { PublicRoomInfo } from '../../shared/protocol';
import { Button, Chip, Spinner } from './ui';

export function RoomList({ rooms, limit }: { rooms: PublicRoomInfo[] | null; limit?: number }) {
  const { join, busy } = useJoin();
  if (!rooms) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }
  const list = limit ? rooms.slice(0, limit) : rooms;
  if (!list.length) {
    return <p className="py-6 text-center text-slate-400">No public arenas are open right now. Create one or hit Quick Play!</p>;
  }
  return (
    <ul className="divide-y divide-white/5">
      {list.map((r) => {
        const full = r.playerCount >= r.maxPlayers;
        const inBattle = r.status === 'in_progress';
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-bold">{r.name}</span>
                {inBattle ? <Chip tone="blood">In battle</Chip> : <Chip tone="volt">{r.status === 'finished' ? 'Post-battle' : 'Lobby'}</Chip>}
              </div>
              <div className="mt-0.5 truncate text-sm text-slate-400">
                Host {r.hostName} · {r.categories.map(categoryLabel).join(', ')} · {r.difficulty}
              </div>
            </div>
            <span className={`font-display text-sm font-bold ${full ? 'text-blood-400' : 'text-aura-300'}`} aria-label="players">
              {r.playerCount}/{r.maxPlayers}
            </span>
            <Button
              variant={inBattle || full ? 'ghost' : 'primary'}
              disabled={inBattle || full}
              loading={busy === r.id}
              onClick={() => join({ roomId: r.id }, r.id)}
              title={inBattle ? 'Battle in progress - spectating is not supported' : full ? 'Room is full' : 'Join'}
            >
              {inBattle ? 'Locked' : full ? 'Full' : 'Join'}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
