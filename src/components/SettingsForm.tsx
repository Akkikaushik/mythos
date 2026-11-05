import { CATEGORIES, DEFAULT_LIMITS, MIXED_CATEGORY, type DifficultySetting, type GameSettings } from '../../shared/rules';

const DIFFS: { id: DifficultySetting; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'mixed', label: 'Mixed' },
];

function Range({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-sm font-semibold uppercase tracking-wider text-arcane-400">
        {label}
        <span className="font-display text-aura-300">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-volt-400"
      />
    </label>
  );
}

export function SettingsForm({
  value,
  onChange,
  disabled,
  minPlayers = DEFAULT_LIMITS.minPlayers,
}: {
  value: GameSettings;
  onChange: (s: GameSettings) => void;
  disabled?: boolean;
  minPlayers?: number;
}) {
  const mixed = value.categories.includes(MIXED_CATEGORY.id);
  const toggle = (id: string) => {
    if (id === MIXED_CATEGORY.id) return onChange({ ...value, categories: [MIXED_CATEGORY.id] });
    const current = mixed ? [] : value.categories;
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    onChange({ ...value, categories: next.length ? next : [MIXED_CATEGORY.id] });
  };
  const L = DEFAULT_LIMITS;
  return (
    <fieldset disabled={disabled} className="space-y-5 disabled:opacity-70">
      <div>
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wider text-arcane-400">Realms (pick one or many)</legend>
        <div className="flex flex-wrap gap-2">
          {[MIXED_CATEGORY, ...CATEGORIES].map((c) => {
            const on = value.categories.includes(c.id);
            return (
              <button
                type="button"
                key={c.id}
                aria-pressed={on}
                onClick={() => toggle(c.id)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                  on
                    ? 'border-volt-400 bg-volt-500/20 text-volt-300 shadow-glow-blue'
                    : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-arcane-500/60'
                }`}
              >
                {c.glyph} {c.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <span className="mb-2 block text-sm font-semibold uppercase tracking-wider text-arcane-400">Difficulty</span>
        <div className="grid grid-cols-4 gap-2">
          {DIFFS.map((d) => (
            <button
              type="button"
              key={d.id}
              aria-pressed={value.difficulty === d.id}
              onClick={() => onChange({ ...value, difficulty: d.id })}
              className={`rounded-xl border py-2 font-display text-xs font-bold uppercase tracking-widest transition ${
                value.difficulty === d.id ? 'border-aura-400 bg-aura-400/15 text-aura-300 shadow-glow-gold' : 'border-white/10 text-slate-300 hover:border-aura-400/50'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Range label="Questions" value={value.questionCount} min={L.minQuestions} max={L.maxQuestions} onChange={(v) => onChange({ ...value, questionCount: v })} />
        <Range label="Timer" suffix="s" value={value.timerSeconds} min={L.minTimer} max={L.maxTimer} onChange={(v) => onChange({ ...value, timerSeconds: v })} />
        <Range label="Max players" value={value.maxPlayers} min={Math.max(L.minPlayers, minPlayers)} max={L.maxPlayers} onChange={(v) => onChange({ ...value, maxPlayers: v })} />
      </div>
      <p className="text-xs text-slate-500">
        If a realm/difficulty combination has fewer questions than requested, the battle is topped up from other difficulties, then
        other realms.
      </p>
    </fieldset>
  );
}
