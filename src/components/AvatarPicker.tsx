import { AVATARS, type AvatarId } from '../../shared/rules';
import { Avatar, AVATAR_META } from './Avatar';

export function AvatarPicker({ value, onChange }: { value: AvatarId; onChange: (a: AvatarId) => void }) {
  return (
    <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Avatar">
      {AVATARS.map((a) => (
        <button
          type="button"
          key={a}
          role="radio"
          aria-checked={value === a}
          aria-label={AVATAR_META[a].name}
          onClick={() => onChange(a)}
          className={`flex flex-col items-center gap-1 rounded-xl p-1.5 transition ${value === a ? 'bg-volt-500/15' : 'hover:bg-white/5'}`}
        >
          <Avatar id={a} size={42} ring={value === a ? 'gold' : undefined} />
          <span className="text-[10px] font-semibold uppercase text-slate-400">{AVATAR_META[a].name}</span>
        </button>
      ))}
    </div>
  );
}
