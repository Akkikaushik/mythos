import { useMemo } from 'react';

/** Decorative animated energy backdrop (pure CSS, pointer-events disabled). */
export function EnergyField({ intensity = 1 }: { intensity?: number }) {
  const sparks = useMemo(
    () =>
      Array.from({ length: Math.round(18 * intensity) }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        top: `${(i * 53) % 100}%`,
        size: 2 + ((i * 7) % 4),
        delay: `${(i % 9) * 0.6}s`,
        dur: `${4 + (i % 5)}s`,
        color: ['#9b5cff', '#38d5ff', '#ffd34d'][i % 3],
      })),
    [intensity],
  );
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="grid-floor absolute inset-0 opacity-60" />
      <div className="absolute -left-40 top-1/4 h-96 w-96 animate-float rounded-full bg-arcane-600/20 blur-3xl" />
      <div className="absolute -right-32 top-10 h-80 w-80 animate-float rounded-full bg-volt-500/15 blur-3xl [animation-delay:1.5s]" />
      <div className="absolute bottom-0 left-1/3 h-72 w-72 animate-float rounded-full bg-aura-500/10 blur-3xl [animation-delay:3s]" />
      <svg className="absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 animate-spin-slow opacity-[0.07]" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="90" fill="none" stroke="#9b5cff" strokeWidth="0.6" strokeDasharray="4 6" />
        <circle cx="100" cy="100" r="70" fill="none" stroke="#38d5ff" strokeWidth="0.4" />
        <polygon points="100,20 169,140 31,140" fill="none" stroke="#ffd34d" strokeWidth="0.5" />
        <polygon points="100,180 31,60 169,60" fill="none" stroke="#ffd34d" strokeWidth="0.5" />
      </svg>
      {sparks.map((s, i) => (
        <span
          key={i}
          className="absolute animate-float rounded-full"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            background: s.color,
            boxShadow: `0 0 10px 2px ${s.color}`,
            animationDelay: s.delay,
            animationDuration: s.dur,
            opacity: 0.7,
          }}
        />
      ))}
    </div>
  );
}
