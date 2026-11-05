import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { backend } from '../lib/api';
import { usePublicRooms } from '../hooks/useRealtime';
import { useToast } from '../state/toast';
import { RoomList } from '../components/RoomList';
import { Button, ErrorNote, PageTitle, Panel } from '../components/ui';

export default function PublicRooms() {
  const { rooms, error } = usePublicRooms();
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [qp, setQp] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const shown = rooms && filter === 'open' ? rooms.filter((r) => r.status !== 'in_progress' && r.playerCount < r.maxPlayers) : rooms;

  return (
    <div>
      <PageTitle kicker="LIVE" title="Public arenas">
        Updates in real time. Battles already in progress are locked until they finish.
      </PageTitle>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['open', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`nav-link ${filter === f ? 'active' : ''}`} aria-pressed={filter === f}>
            {f === 'open' ? 'Joinable' : 'All'}
          </button>
        ))}
        <span className="flex-1" />
        <Link to="/create" className="btn btn-ghost">
          Create room
        </Link>
        <Button
          variant="gold"
          loading={qp}
          onClick={async () => {
            setQp(true);
            try {
              navigate(`/room/${(await backend.quickPlay()).id}`);
            } catch (e) {
              toast((e as Error).message, 'error');
              setQp(false);
            }
          }}
        >
          Quick play
        </Button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel>
        <RoomList rooms={shown} />
      </Panel>
    </div>
  );
}
