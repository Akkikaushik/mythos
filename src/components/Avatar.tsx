import { useId, type ReactNode } from 'react';
import type { AvatarId } from '../../shared/rules';
import { levelForXp, rankTier } from '../../shared/rules';

type BackHair = 'short' | 'long' | 'spiky';
type Bangs = 'spiky' | 'swept' | 'parted';
type Extra =
  | 'hood'
  | 'wings'
  | 'topknot'
  | 'bun'
  | 'foxEars'
  | 'jackalEars'
  | 'headband'
  | 'helmetBand'
  | 'horns'
  | 'feathers'
  | 'flames'
  | 'bolt'
  | 'scales'
  | 'crescent'
  | 'thirdEye'
  | 'helmet'
  | 'unicorn'
  | 'kohl'
  | 'collar'
  | 'fang'
  | 'cheekMarks';

interface Character {
  name: string;
  from: string;
  to: string;
  skin: string;
  hair: string;
  hairShade: string;
  eyes: [string, string];
  outfit: string;
  back: BackHair;
  bangs: Bangs;
  fierce?: boolean;
  slit?: boolean;
  extras: Extra[];
}

export const AVATAR_META: Record<AvatarId, Character> = {
  ronin: {
    name: 'Ronin', from: '#9b5cff', to: '#38d5ff', skin: '#f6d2b5', hair: '#3a2f5c', hairShade: '#16112a',
    eyes: ['#4c1d95', '#a78bfa'], outfit: '#1e1b4b', back: 'short', bangs: 'spiky', fierce: true,
    extras: ['topknot', 'headband'],
  },
  kitsune: {
    name: 'Kitsune', from: '#ff8a3d', to: '#ffd34d', skin: '#ffe2cc', hair: '#ff9a3c', hairShade: '#c2410c',
    eyes: ['#b45309', '#fcd34d'], outfit: '#7c2d12', back: 'long', bangs: 'parted',
    extras: ['foxEars', 'cheekMarks'],
  },
  oni: {
    name: 'Oni', from: '#ff2d55', to: '#7c3aed', skin: '#f3cfb6', hair: '#eef0f8', hairShade: '#8b90ab',
    eyes: ['#7f1d1d', '#f87171'], outfit: '#450a0a', back: 'spiky', bangs: 'spiky', fierce: true,
    extras: ['horns', 'fang'],
  },
  valkyrie: {
    name: 'Valkyrie', from: '#38d5ff', to: '#e0f2fe', skin: '#ffe6d5', hair: '#ffe27a', hairShade: '#d99a1e',
    eyes: ['#1d4ed8', '#7dd3fc'], outfit: '#334155', back: 'long', bangs: 'swept',
    extras: ['wings', 'helmetBand'],
  },
  garuda: {
    name: 'Garuda', from: '#f5b700', to: '#ff5c7a', skin: '#e9b58e', hair: '#4a3220', hairShade: '#1d140c',
    eyes: ['#a16207', '#fde047'], outfit: '#7f1d1d', back: 'short', bangs: 'spiky', fierce: true,
    extras: ['feathers', 'cheekMarks'],
  },
  naga: {
    name: 'Naga', from: '#10b981', to: '#38d5ff', skin: '#f1d6bd', hair: '#22c5a5', hairShade: '#0e5f55',
    eyes: ['#166534', '#86efac'], outfit: '#064e3b', back: 'long', bangs: 'parted', slit: true,
    extras: ['hood', 'scales'],
  },
  phoenix: {
    name: 'Phoenix', from: '#ff5c7a', to: '#ffd34d', skin: '#ffdcc4', hair: '#ff5a36', hairShade: '#9f1239',
    eyes: ['#c2410c', '#fdba74'], outfit: '#881337', back: 'spiky', bangs: 'spiky',
    extras: ['flames'],
  },
  raijin: {
    name: 'Raijin', from: '#0ea5ff', to: '#b48cff', skin: '#f5d5bd', hair: '#a5e8ff', hairShade: '#2563eb',
    eyes: ['#5b21b6', '#c4b5fd'], outfit: '#1e3a8a', back: 'spiky', bangs: 'spiky', fierce: true,
    extras: ['bolt'],
  },
  shiva: {
    name: 'Rudra', from: '#5b21b6', to: '#38d5ff', skin: '#bcd3f7', hair: '#241a40', hairShade: '#0b0818',
    eyes: ['#0369a1', '#67e8f9'], outfit: '#312e81', back: 'long', bangs: 'parted',
    extras: ['bun', 'crescent', 'thirdEye'],
  },
  athena: {
    name: 'Athena', from: '#94a3b8', to: '#ffd34d', skin: '#fbe0cb', hair: '#8a5530', hairShade: '#4a2a12',
    eyes: ['#475569', '#cbd5e1'], outfit: '#f1f5f9', back: 'long', bangs: 'swept',
    extras: ['helmet'],
  },
  anubis: {
    name: 'Anubis', from: '#1e1449', to: '#f5b700', skin: '#c68a5a', hair: '#17131f', hairShade: '#000000',
    eyes: ['#a16207', '#facc15'], outfit: '#111827', back: 'short', bangs: 'parted',
    extras: ['jackalEars', 'kohl', 'collar'],
  },
  kirin: {
    name: 'Kirin', from: '#22d3ee', to: '#a3e635', skin: '#fde3cf', hair: '#5eead4', hairShade: '#0f766e',
    eyes: ['#3f6212', '#bef264'], outfit: '#134e4a', back: 'long', bangs: 'swept',
    extras: ['unicorn'],
  },
};

const INK = '#1a1026';

/** Draws its children on the left and mirrored on the right. */
function Pair({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <g transform="translate(100 0) scale(-1 1)">{children}</g>
    </>
  );
}

function BackHairShape({ style, fill }: { style: BackHair; fill: string }) {
  if (style === 'long')
    return <path d="M25 44 Q19 10 50 9 Q81 10 75 44 L80 88 Q70 84 64 74 L36 74 Q30 84 20 88 Z" fill={fill} />;
  if (style === 'spiky')
    return (
      <path
        d="M25 48 L16 34 L27 30 L21 14 L36 19 L40 4 L51 14 L62 3 L65 19 L80 13 L74 30 L85 34 L75 48 Z"
        fill={fill}
      />
    );
  return <path d="M25 52 Q19 12 50 10 Q81 12 75 52 Z" fill={fill} />;
}

function BangsShape({ style, fill }: { style: Bangs; fill: string }) {
  if (style === 'swept')
    return <path d="M28 44 Q25 17 52 15 Q76 17 72 42 Q64 27 46 29 Q37 35 28 44 Z" fill={fill} />;
  if (style === 'parted')
    return <path d="M28 45 Q26 17 50 15 Q74 17 72 45 Q67 29 53 25 L50 31 L47 25 Q33 29 28 45 Z" fill={fill} />;
  return (
    <path
      d="M28 42 Q26 18 50 15 Q74 18 72 42 L68 33 L64 41 L58 30 L52 40 L46 29 L40 40 L35 31 Z"
      fill={fill}
    />
  );
}

function Eye({ c, iris, slit }: { c: Character; iris: string; slit?: boolean }) {
  return (
    <g>
      <ellipse cx="40" cy="49" rx="5.6" ry="6.4" fill="#fff" />
      <ellipse cx="40" cy="49.5" rx="4.5" ry="5.9" fill={iris} />
      {slit ? (
        <ellipse cx="40" cy="49.5" rx="0.9" ry="4" fill={INK} />
      ) : (
        <ellipse cx="40" cy="50" rx="2" ry="2.9" fill={INK} />
      )}
      <circle cx="38.2" cy="46.6" r="1.6" fill="#fff" />
      <circle cx="41.8" cy="52" r="0.8" fill="#fff" opacity=".85" />
      <path d="M33.6 44.8 Q40 40.6 46.4 44.2" stroke={INK} strokeWidth="2.1" fill="none" strokeLinecap="round" />
      <path d="M33.8 45 L32 43.4" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
      {c.extras.includes('kohl') && (
        <path d="M33.8 45 L28.5 46.6" stroke="#facc15" strokeWidth="1.2" strokeLinecap="round" />
      )}
    </g>
  );
}

export function AvatarArt({ id }: { id: AvatarId }) {
  const c = AVATAR_META[id] ?? AVATAR_META.ronin;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const bg = `bg${uid}`;
  const hair = `hair${uid}`;
  const iris = `iris${uid}`;
  const has = (e: Extra) => c.extras.includes(e);
  const hairFill = `url(#${hair})`;

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" className="block">
      <defs>
        <radialGradient id={bg} cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor={c.to} />
          <stop offset="100%" stopColor={c.from} />
        </radialGradient>
        <linearGradient id={hair} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.hair} />
          <stop offset="100%" stopColor={c.hairShade} />
        </linearGradient>
        <linearGradient id={iris} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.eyes[0]} />
          <stop offset="100%" stopColor={c.eyes[1]} />
        </linearGradient>
      </defs>

      <rect width="100" height="100" fill={`url(#${bg})`} />

      {has('hood') && (
        <>
          <path d="M16 78 Q6 30 50 12 Q94 30 84 78 Z" fill="#065f46" />
          <path d="M24 70 Q18 36 50 22 Q82 36 76 70" fill="none" stroke="#34d399" strokeWidth="1.5" strokeDasharray="3 3" />
        </>
      )}
      {has('wings') && (
        <Pair>
          <path d="M30 38 Q14 35 5 18 Q15 22 19 20 Q12 14 12 6 Q24 15 33 31 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.8" />
        </Pair>
      )}

      <path d="M12 100 Q16 80 40 77 L60 77 Q84 80 88 100 Z" fill={c.outfit} />
      <path d="M41 77 L50 90 L59 77" fill="none" stroke="#ffffff" strokeOpacity=".35" strokeWidth="1.5" />
      {has('collar') && <path d="M30 82 Q50 96 70 82 L72 87 Q50 102 28 87 Z" fill="#f5b700" stroke="#92400e" strokeWidth="0.6" />}

      <BackHairShape style={c.back} fill={hairFill} />
      {has('topknot') && <path d="M48 14 Q56 0 70 4 Q60 7 55 16 Z" fill={hairFill} />}
      {has('bun') && <circle cx="50" cy="12" r="8.5" fill={hairFill} />}

      {has('foxEars') && (
        <Pair>
          <path d="M27 31 L22 5 L44 20 Z" fill={c.hair} />
          <path d="M29 27 L26 12 L39 20 Z" fill="#fff1e6" />
        </Pair>
      )}
      {has('jackalEars') && (
        <Pair>
          <path d="M29 31 L25 0 L44 20 Z" fill={c.hair} />
          <path d="M31 27 L28.5 8 L40 20 Z" fill="#f5b700" />
        </Pair>
      )}

      <path d="M44 62 L44 80 L56 80 L56 62 Z" fill={c.skin} />
      <path d="M44 64 Q50 71 56 64 L56 62 L44 62 Z" fill="#000" opacity=".15" />
      <path d="M30 40 Q30 62 50 72 Q70 62 70 40 Q70 22 50 22 Q30 22 30 40 Z" fill={c.skin} />

      <Pair>
        <ellipse cx="35" cy="57" rx="3.6" ry="1.8" fill="#ff5c7a" opacity=".3" />
      </Pair>
      <Pair>
        <Eye c={c} iris={`url(#${iris})`} slit={c.slit} />
      </Pair>
      <path d="M50.4 54 L49.4 56.6" stroke="#000" strokeOpacity=".28" strokeWidth="1" strokeLinecap="round" />
      {c.fierce ? (
        <path d="M46.5 62 L53.5 61.4" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
      ) : (
        <path d="M46.8 61 Q50 63.6 53.2 61" stroke={INK} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      )}
      {has('fang') && <path d="M51.6 61.7 L52.6 64.6 L53.6 61.5 Z" fill="#fff" />}
      {has('cheekMarks') && (
        <Pair>
          <path d="M31.5 54 L37 55.2 L31.8 56.4 Z" fill="#dc2626" />
        </Pair>
      )}
      {has('scales') && (
        <Pair>
          <path d="M30.5 52 q1.6 -1.6 3.2 0 M31.5 55 q1.6 -1.6 3.2 0" stroke="#10b981" strokeWidth="0.8" fill="none" />
        </Pair>
      )}
      {has('bolt') && <path d="M67 51 L61.5 58 L65 58 L62.5 65 L68.5 56.6 L65 56.6 Z" fill="#facc15" stroke="#a16207" strokeWidth="0.5" />}

      <BangsShape style={c.bangs} fill={hairFill} />
      <path d="M36 22 Q44 17.5 53 18.5" stroke="#fff" strokeOpacity=".4" strokeWidth="2" fill="none" strokeLinecap="round" />

      <Pair>
        {c.fierce ? (
          <path d="M33 37.5 L45.5 40.5" stroke={c.hairShade} strokeWidth="2" strokeLinecap="round" />
        ) : (
          <path d="M33.5 38.5 Q39 36 45 37.8" stroke={c.hairShade} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        )}
      </Pair>

      {has('headband') && (
        <>
          <path d="M28 34 Q50 28 72 34 L72 38.6 Q50 32.6 28 38.6 Z" fill="#e11d48" />
          <path d="M71 35 Q82 39 87 50 Q78 46 72 41 Z" fill="#be123c" />
          <path d="M71 37 Q79 45 79 58 Q73 50 70 41 Z" fill="#e11d48" />
        </>
      )}
      {has('helmetBand') && (
        <path d="M28.5 34 Q50 25 71.5 34 L71.5 38.5 Q50 29.5 28.5 38.5 Z" fill="#cbd5e1" stroke="#64748b" strokeWidth="0.7" />
      )}
      {has('helmet') && (
        <>
          <path d="M34 16 Q48 -6 76 9 Q68 3 58 3.5 Q45 3 34 16 Z" fill="#dc2626" />
          <path d="M26.5 40 Q25 13 50 11 Q75 13 73.5 40 L69.5 40 Q68.5 21 50 19.5 Q31.5 21 30.5 40 Z" fill="#eab308" stroke="#854d0e" strokeWidth="0.8" />
        </>
      )}
      {has('horns') && (
        <Pair>
          <path d="M36 27 Q29 16 30 4 Q38 13 42.5 24 Z" fill="#fde68a" stroke="#b45309" strokeWidth="0.8" />
        </Pair>
      )}
      {has('feathers') && (
        <>
          <path d="M50 18 Q44.5 8 50 0.5 Q55.5 8 50 18 Z" fill="#f5b700" stroke="#b45309" strokeWidth="0.6" />
          <Pair>
            <path d="M44 19 Q35 11 35 3 Q43.5 8 47 17.5 Z" fill="#ef4444" stroke="#991b1b" strokeWidth="0.6" />
          </Pair>
        </>
      )}
      {has('flames') && (
        <>
          <path d="M38 21 Q31 9 39 0 Q41 9 47 11 Q47 3 54 0 Q59 9 57 13 Q63 8 64 2 Q71 12 63 21 Z" fill="#fb923c" />
          <path d="M43 20 Q40 12 44 7 Q46 13 50 14 Q51 8 55 6 Q58 13 56 20 Z" fill="#fde047" />
        </>
      )}
      {has('crescent') && (
        <path d="M57 6 A7 7 0 1 0 60 19 A5.2 5.2 0 1 1 57 6 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.5" />
      )}
      {has('thirdEye') && <ellipse cx="50" cy="29.5" rx="1" ry="2.6" fill="#dc2626" />}
      {has('unicorn') && (
        <>
          <path d="M47.3 24 L50 1.5 L52.7 24 Z" fill="#facc15" stroke="#a16207" strokeWidth="0.6" />
          <path d="M48 19 L52 17.5 M48.6 13.5 L51.6 12.3 M49.2 8.2 L51 7.5" stroke="#a16207" strokeWidth="0.6" />
        </>
      )}
    </svg>
  );
}

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
      style={{ width: size, height: size }}
    >
      <AvatarArt id={id in AVATAR_META ? id : 'ronin'} />
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
