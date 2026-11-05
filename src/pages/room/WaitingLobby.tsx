import { useEffect, useState } from 'react';
import { backend } from '../../lib/api';
import { useToast } from '../../state/toast';
import { sfx } from '../../lib/sfx';
import { Avatar, RankBadge } from '../../components/Avatar';
import { SettingsForm } from '../../components/SettingsForm';
import { Button, Chip, Panel } from '../../components/ui';
import { categoryLabel, validateRoomName, type GameSettings } from '../../../shared/rules';
import type { RoomSnapshot } from '../../../shared/protocol';

export default function WaitingLobby({
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
  const toast = useToast();
  const [draft, setDraft] = useState<GameSettings>(room.settings);
  const [name, setName] = useState(room.name);
  const [isPublic, setIsPublic] = useState(room.isPublic);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // follow server state unless the host is mid-edit
  useEffect(() => {
    if (!dirty) {
      setDraft(room.settings);
      setName(room.name);
      setIsPublic(room.isPublic);
    }
  }, [room.settings, room.name, room.isPublic, dirty]);

  const connected = room.players.filter((p) => p.connected).length;
  const invite = `${location.origin}/join/${room.code}`;

  const act = async (key: string, msg: Parameters<typeof backend.realtime.send>[0], ok?: string) => {
    setBusy(key);
    const ack = await backend.realtime.send(msg);
    setBusy(null);
    if (!ack.ok) toast(ack.error ?? 'Action failed', 'error');
    else if (ok) toast(ok, 'success');
    return ack.ok;
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`, 'success');
    } catch {
      toast(text, 'info');
    }
  };

  const save = async () => {
    const n = validateRoomName(name);
    if (!n.ok) return toast(n.error, 'error');
    if (await act('save', { type: 'room.settings', settings: draft, name: n.value, isPublic }, 'Settings saved')) setDirty(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <Panel glow="gold" className="animate-rise">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-display text-xs tracking-[0.35em] text-aura-300">WAITING LOBBY</p>
              <h1 className="font-display text-3xl font-black">{room.name}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <Chip tone={room.isPublic ? 'volt' : 'arcane'}>{room.isPublic ? 'Public' : 'Private'}</Chip>
                <Chip tone="aura">
                  {room.players.length}/{room.settings.maxPlayers} warriors
                </Chip>
                <Chip tone="slate">{connected} online</Chip>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Room code</p>
              <button
                onClick={() => copy(room.code, 'Room code')}
                className="font-display text-4xl font-black tracking-[0.3em] text-aura-300 drop-shadow-[0_0_14px_rgba(255,211,77,.6)] hover:brightness-125"
                title="Copy code"
              >
                {room.code}
              </button>
              <div>
                <button onClick={() => copy(invite, 'Invite link')} className="text-sm font-semibold text-volt-300 hover:underline">
                  Copy invite link
                </button>
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <h2 className="mb-3 font-display text-lg font-bold uppercase tracking-widest text-volt-300">Warriors</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {room.players.map((p) => (
              <li
                key={p.userId}
                className={`relative flex flex-col items-center gap-1 rounded-xl border p-3 text-center animate-rise ${
                  p.userId === meId ? 'border-volt-400/50 bg-volt-500/10' : 'border-white/5 bg-white/[0.02]'
                }`}
              >
                <Avatar id={p.avatar} size={56} ring={p.isHost ? 'gold' : undefined} dim={!p.connected} />
                <span className="max-w-full truncate font-bold">
                  {p.isHost ? '👑 ' : ''}
                  {p.username}
                </span>
                <RankBadge level={p.level} />
                <span className={`text-xs font-semibold ${p.connected ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {p.connected ? '● ready' : '○ disconnected'}
                </span>
                {isHost && p.userId !== meId ? (
                  <button
                    className="absolute right-1.5 top-1.5 rounded-md px-1.5 text-xs text-slate-500 hover:bg-blood-500/20 hover:text-blood-400"
                    onClick={() => act(`kick-${p.userId}`, { type: 'room.kick', userId: p.userId }, `${p.username} removed`)}
                    aria-label={`Remove ${p.username}`}
                    title="Remove from room"
                  >
                    ✕
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel>
          <h2 className="mb-3 font-display text-lg font-bold uppercase tracking-widest text-volt-300">Battle settings</h2>
          {isHost ? (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold uppercase tracking-wider text-arcane-400">Room name</span>
                <input
                  className="input"
                  value={name}
                  maxLength={32}
                  onChange={(e) => {
                    setName(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-volt-400"
                  checked={isPublic}
                  onChange={(e) => {
                    setIsPublic(e.target.checked);
                    setDirty(true);
                  }}
                />
                List in public room browser
              </label>
              <SettingsForm
                value={draft}
                minPlayers={room.players.length}
                onChange={(s) => {
                  setDraft(s);
                  setDirty(true);
                }}
              />
              {dirty ? (
                <div className="flex gap-2">
                  <Button onClick={save} loading={busy === 'save'}>
                    Save settings
                  </Button>
                  <Button variant="ghost" onClick={() => setDirty(false)}>
                    Discard
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <dt className="text-slate-400">Realms</dt>
                <dd className="font-semibold">{room.settings.categories.map(categoryLabel).join(', ')}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Difficulty</dt>
                <dd className="font-semibold capitalize">{room.settings.difficulty}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Questions</dt>
                <dd className="font-semibold">{room.settings.questionCount}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Timer</dt>
                <dd className="font-semibold">{room.settings.timerSeconds}s</dd>
              </div>
              <div>
                <dt className="text-slate-400">Max players</dt>
                <dd className="font-semibold">{room.settings.maxPlayers}</dd>
              </div>
            </dl>
          )}
        </Panel>

        <Panel glow="blue" className="space-y-3">
          {isHost ? (
            <Button
              variant="gold"
              className="w-full py-4 text-base"
              loading={busy === 'start'}
              disabled={dirty}
              title={dirty ? 'Save or discard settings first' : undefined}
              onClick={async () => {
                if (await act('start', { type: 'room.start' })) sfx.start();
              }}
            >
              ⚔ Begin the battle
            </Button>
          ) : (
            <p className="animate-pulse text-center font-display text-sm uppercase tracking-widest text-volt-300">
              Waiting for the host to begin…
            </p>
          )}
          <Button variant="danger" className="w-full" onClick={onLeave}>
            Leave room
          </Button>
        </Panel>
      </div>
    </div>
  );
}
