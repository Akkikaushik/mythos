import type { AvatarId } from '../../shared/rules';
import { levelForXp, rankTier } from '../../shared/rules';

export const AVATAR_META: Record<AvatarId, { name: string; glyph: string; from: string; to: string }> = {
  ronin: { name: 'Ronin', glyph: '侍', from: '#9b5cff', to: '#38d5ff' },
  kitsune: { name: 'Kitsune', glyph: '狐', from: '#ff8a3d', to: '#ffd34d' },
  oni: { name: 'Oni', glyph: '鬼', from: '#ff2d55', to: '#7c3aed' },
  valkyrie: { name: 'Valkyrie', glyph: 'ᛟ', from: '#38d5ff', to: '#e0f2fe' },
  garuda: { name: 'Garuda', glyph: '翼', from: '#f5b700', to: '#ff5c7a' },
  naga: { name: 'Naga', glyph: '蛇', from: '#10b981', to: '#38d5ff' },
  phoenix: { name: 'Phoenix', glyph: '鳳', from: '#ff5c7a', to: '#ffd34d' },
  raijin: { name: 'Raijin', glyph: '雷', from: '#0ea5ff', to: '#b48cff' },
  shiva: { name: 'Rudra', glyph: 'ॐ', from: '#5b21b6', to: '#38d5ff' },
  athena: { name: 'Athena', glyph: 'Ω', from: '#94a3b8', to: '#ffd34d' },
  anubis: { name: 'Anubis', glyph: '☥', from: '#1e1449', to: '#f5b700' },
  kirin: { name: 'Kirin', glyph: '麒', from: '#22d3ee', to: '#a3e635' },
};

export function Avatar({
  id,
  size = 48,
  ring,
  dim,
  className = '',
}: {
  id: AvatarId;
  size?: number;
  ring?: 'gold' | 'blue' | 'red' | 'green';
  dim?: boolean;
  className?: string;
}) {
  const m = AVATAR_META[id] ?? AVATAR_META.ronin;
  const ringCls = {
    gold: 'ring-2 ring-aura-400 shadow-glow-gold',
    blue: 'ring-2 ring-volt-400 shadow-glow-blue',
    red: 'ring-2 ring-blood-500 shadow-glow-red',
    green: 'ring-2 ring-emerald-400',
  };
  return (
    <span
      title={m.name}
      className={`relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full ${ring ? ringCls[ring] : 'ring-1 ring-white/15'} ${dim ? 'opacity-40 grayscale' : ''} ${className}`}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${m.from}, ${m.to})` }}
    >
      <span className="absolute inset-[3px] rounded-full bg-void-900/70" />
      <span className="relative font-bold text-white drop-shadow-[0_0_6px_rgba(255,255,255,.6)]" style={{ fontSize: size * 0.45 }}>
        {m.glyph}
      </span>
    </span>
  );
}

export function RankBadge({ level, xp }: { level?: number; xp?: number }) {
  const lv = level ?? levelForXp(xp ?? 0);
  const tier = rankTier(lv);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider"
      style={{ color: tier.color, borderColor: `${tier.color}66`, background: `${tier.color}14` }}
      title={`${tier.name} - level ${lv}`}
    >
      ◆ {tier.name} {lv}
    </span>
  );
}
