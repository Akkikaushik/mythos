import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { backend } from '../lib/api';
import { useAuth } from '../state/auth';
import { Button, ErrorNote, Field, PageTitle, Panel } from '../components/ui';
import { SettingsForm } from '../components/SettingsForm';
import { DEFAULT_SETTINGS, validateRoomName, validateSettings, type GameSettings } from '../../shared/rules';

export default function CreateRoom() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(`${profile?.username ?? 'My'}'s Arena`.slice(0, 32));
  const [isPublic, setIsPublic] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = validateRoomName(name);
    if (!n.ok) return setError(n.error);
    const s = validateSettings(settings);
    if (!s.ok) return setError(s.error);
    setBusy(true);
    setError(null);
    try {
      const room = await backend.createRoom({ name: n.value, isPublic, settings: s.value });
      navigate(`/room/${room.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle kicker="SUMMON AN ARENA" title="Create room" />
      <Panel>
        <form onSubmit={submit} className="space-y-6">
          <Field label="Room name" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} required />
          <div>
            <span className="mb-2 block text-sm font-semibold uppercase tracking-wider text-arcane-400">Visibility</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                [false, '🔒 Private', 'Join with code or invite link only'],
                [true, '🌐 Public', 'Listed in the room browser & quick play'],
              ].map(([v, t, d]) => (
                <button
                  type="button"
                  key={String(v)}
                  aria-pressed={isPublic === v}
                  onClick={() => setIsPublic(v as boolean)}
                  className={`rounded-xl border p-3 text-left transition ${
                    isPublic === v ? 'border-volt-400 bg-volt-500/15 shadow-glow-blue' : 'border-white/10 hover:border-arcane-500/60'
                  }`}
                >
                  <div className="font-bold">{t as string}</div>
                  <div className="text-xs text-slate-400">{d as string}</div>
                </button>
              ))}
            </div>
          </div>
          <SettingsForm value={settings} onChange={setSettings} />
          <ErrorNote>{error}</ErrorNote>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" variant="gold" loading={busy}>
              Open the arena
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
