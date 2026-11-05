import { useNavigate } from 'react-router-dom';
import { setPrefs, usePrefs } from '../lib/prefs';
import { sfx } from '../lib/sfx';
import { backend } from '../lib/api';
import { useAuth } from '../state/auth';
import { useConnectionStatus } from '../hooks/useRealtime';
import { Button, PageTitle, Panel } from '../components/ui';

function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span>
        <span className="block font-bold">{label}</span>
        <span className="text-sm text-slate-400">{desc}</span>
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-white/10 transition peer-checked:bg-volt-500 peer-focus-visible:ring-2 peer-focus-visible:ring-volt-400 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

export default function Settings() {
  const prefs = usePrefs();
  const { profile, logout } = useAuth();
  const conn = useConnectionStatus();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle kicker="CONFIGURE" title="Settings" />
      <Panel>
        <h2 className="font-display text-sm font-bold uppercase tracking-widest text-volt-300">Experience</h2>
        <div className="divide-y divide-white/5">
          <Toggle label="Sound effects" desc="Synthesised battle cues: ticks, hits and victory fanfare." checked={prefs.sound} onChange={(v) => setPrefs({ sound: v })} />
          <label className="flex items-center justify-between gap-4 py-3">
            <span className="font-bold">Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={prefs.volume}
              disabled={!prefs.sound}
              onChange={(e) => setPrefs({ volume: Number(e.target.value) })}
              onMouseUp={() => sfx.correct()}
              className="w-48 accent-volt-400"
            />
          </label>
          <Toggle label="Reduce motion" desc="Turn off energy animations and shakes." checked={prefs.reducedMotion} onChange={(v) => setPrefs({ reducedMotion: v })} />
          <Toggle label="Show explanations" desc="Display the lore explanation after each answer reveal." checked={prefs.showExplanations} onChange={(v) => setPrefs({ showExplanations: v })} />
        </div>
      </Panel>
      <Panel>
        <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-widest text-volt-300">Account</h2>
        <p className="text-slate-300">
          Signed in as <span className="font-bold">{profile?.username}</span>
          {profile?.isGuest ? ' (guest - signing out loses access to this account)' : ''}.
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Backend: <code>{backend.kind}</code> · realtime: <code>{conn}</code>
        </p>
        <Button
          variant="danger"
          className="mt-4"
          onClick={() => {
            logout();
            navigate('/');
          }}
        >
          Sign out
        </Button>
      </Panel>
    </div>
  );
}
