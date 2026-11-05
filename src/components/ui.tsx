import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { sfx } from '../lib/sfx';

type Variant = 'primary' | 'gold' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  loading,
  className = '',
  children,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      onClick={(e) => {
        sfx.click();
        onClick?.(e);
      }}
      className={`btn btn-${variant} ${className}`}
    >
      {loading ? <Spinner small /> : null}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

export function Panel({ children, className = '', glow }: { children: ReactNode; className?: string; glow?: 'gold' | 'blue' }) {
  return <section className={`panel ${glow ? `panel-${glow}` : ''} ${className}`}>{children}</section>;
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-volt-400 border-t-transparent ${small ? 'h-4 w-4' : 'h-8 w-8'}`}
    />
  );
}

export function Field({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold uppercase tracking-wider text-arcane-400">{label}</span>
      <input {...rest} className={`input ${rest.className ?? ''}`} />
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function Chip({ children, tone = 'arcane' }: { children: ReactNode; tone?: 'arcane' | 'volt' | 'aura' | 'blood' | 'slate' }) {
  const map = {
    arcane: 'border-arcane-500/50 text-arcane-400 bg-arcane-500/10',
    volt: 'border-volt-400/50 text-volt-300 bg-volt-500/10',
    aura: 'border-aura-400/50 text-aura-300 bg-aura-400/10',
    blood: 'border-blood-500/50 text-blood-400 bg-blood-500/10',
    slate: 'border-slate-500/40 text-slate-300 bg-slate-500/10',
  } as const;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${map[tone]}`}>{children}</span>;
}

export function PageTitle({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 animate-rise">
      {kicker ? <p className="font-display text-xs tracking-[0.35em] text-volt-300">{kicker}</p> : null}
      <h1 className="title-glow font-display text-3xl font-black uppercase tracking-wide sm:text-4xl">{title}</h1>
      {children ? <div className="mt-2 text-slate-300">{children}</div> : null}
    </header>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg border border-blood-500/40 bg-blood-500/10 px-3 py-2 text-sm font-semibold text-blood-400">
      {children}
    </p>
  );
}

export function Stat({ label, value, tone = 'volt' }: { label: string; value: ReactNode; tone?: 'volt' | 'aura' | 'arcane' }) {
  const color = { volt: 'text-volt-300', aura: 'text-aura-300', arcane: 'text-arcane-400' }[tone];
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-center">
      <div className={`font-display text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}
