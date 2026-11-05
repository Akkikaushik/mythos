import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { backend } from '../../lib/api';
import { useAuth } from '../../state/auth';
import { useToast } from '../../state/toast';
import { useConnectionStatus } from '../../hooks/useRealtime';
import { Button, Panel, Spinner } from '../../components/ui';
import type { RoomSnapshot } from '../../../shared/protocol';
import WaitingLobby from './WaitingLobby';
import Arena from './Arena';
import Results from './Results';

const REMOVED_TEXT: Record<string, string> = {
  kicked: 'The host removed you from the room.',
  expired: 'The room was closed.',
  left: 'You left the room.',
};

export default function RoomPage() {
  const { roomId = '' } = useParams();
  const { profile, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const conn = useConnectionStatus();
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    setRoom(null);
    setFatal(null);
    return backend.realtime.subscribeRoom(roomId, {
      onState: setRoom,
      onRemoved: (reason) => {
        if (reason === 'left') return;
        const text = REMOVED_TEXT[reason] ?? reason;
        if (REMOVED_TEXT[reason]) {
          toast(text, 'error');
          navigate('/hub');
        } else setFatal(text);
      },
      onError: (e) => toast(e, 'error'),
    });
  }, [roomId, navigate, toast]);

  const leave = async () => {
    const ack = await backend.realtime.send({ type: 'room.leave' });
    if (!ack.ok) toast(ack.error ?? 'Could not leave', 'error');
    await refresh();
    navigate('/hub');
  };

  if (fatal) {
    return (
      <Panel className="mx-auto max-w-md text-center">
        <h1 className="font-display text-2xl font-black text-blood-400">Cannot enter this arena</h1>
        <p className="mt-2 text-slate-300">{fatal}</p>
        <p className="mt-1 text-sm text-slate-400">Private rooms need a code - ask the host for an invite link.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link to="/join" className="btn btn-primary">
            Enter a code
          </Link>
          <Link to="/hub" className="btn btn-ghost">
            Back to lobby
          </Link>
        </div>
      </Panel>
    );
  }

  if (!room || !profile) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-slate-400">
        <Spinner />
        <span>{conn === 'reconnecting' || conn === 'offline' ? 'Reconnecting to the arena…' : 'Entering the arena…'}</span>
      </div>
    );
  }

  const me = room.players.find((p) => p.userId === profile.id);
  const isHost = room.hostId === profile.id;

  return (
    <div>
      {conn !== 'online' ? (
        <div className="mb-4 rounded-xl border border-aura-400/40 bg-aura-400/10 px-4 py-2 text-center font-semibold text-aura-300" role="status">
          Connection lost - reconnecting. Your seat and score are kept by the server.
        </div>
      ) : null}
      {room.status === 'in_progress' && room.match ? (
        <Arena room={room} meId={profile.id} />
      ) : room.status === 'finished' && room.match?.standings ? (
        <Results room={room} meId={profile.id} isHost={isHost} onLeave={leave} />
      ) : (
        <WaitingLobby room={room} meId={profile.id} isHost={isHost} onLeave={leave} />
      )}
      {!me ? (
        <div className="mt-4 text-center">
          <Button variant="ghost" onClick={() => navigate('/hub')}>
            Back to lobby
          </Button>
        </div>
      ) : null}
    </div>
  );
}
