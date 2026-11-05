import { Link } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { Avatar } from '../components/Avatar';
import { CATEGORIES, MIXED_CATEGORY, AVATARS, SCORING } from '../../shared/rules';

export default function Landing() {
  const { profile } = useAuth();
  return (
    <div className="space-y-16">
      <section className="relative grid items-center gap-10 pt-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="animate-rise">
          <p className="font-display text-xs tracking-[0.45em] text-volt-300">REAL-TIME QUIZ BATTLE ARENA</p>
          <h1 className="title-glow mt-3 font-display text-5xl font-black uppercase leading-[1.05] sm:text-7xl">
            Enter the
            <br />
            Arena of Myth
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-300">
            Summon up to 20 warriors, answer under a shared countdown, chain streaks, and climb the global rankings. Every
            point is judged by the server - speed and knowledge are your only weapons.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {profile ? (
              <Link to="/hub" className="btn btn-gold px-8 py-3.5 text-base">
                ⚔ Enter the Arena
              </Link>
            ) : (
              <>
                <Link to="/auth?mode=register" className="btn btn-gold px-8 py-3.5 text-base">
                  ⚔ Begin your legend
                </Link>
                <Link to="/auth" className="btn btn-ghost px-6 py-3.5">
                  Sign in
                </Link>
              </>
            )}
          </div>
          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-3 text-center">
            {[
              ['20', 'Warriors / room'],
              [`${SCORING.correct}+${SCORING.maxSpeedBonus}`, 'Points + speed'],
              [String(CATEGORIES.length + 1), 'Realms of lore'],
            ].map(([v, l]) => (
              <div key={l} className="rounded-xl border border-arcane-500/20 bg-void-900/60 p-3">
                <dt className="font-display text-2xl font-black text-aura-300">{v}</dt>
                <dd className="text-xs uppercase tracking-wider text-slate-400">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative mx-auto aspect-square w-full max-w-md">
          <div className="absolute inset-0 animate-spin-slow rounded-full border border-dashed border-arcane-500/40" />
          <div className="absolute inset-8 animate-pulse-glow rounded-full border border-volt-400/40" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-8xl font-black text-aura-300 drop-shadow-[0_0_30px_rgba(255,211,77,.7)]">VS</span>
          </div>
          {AVATARS.slice(0, 8).map((a, i) => {
            const angle = (i / 8) * Math.PI * 2;
            return (
              <div
                key={a}
                className="absolute animate-float"
                style={{
                  left: `${50 + Math.cos(angle) * 42}%`,
                  top: `${50 + Math.sin(angle) * 42}%`,
                  transform: 'translate(-50%,-50%)',
                  animationDelay: `${i * 0.4}s`,
                }}
              >
                <Avatar id={a} size={64} ring={i % 2 ? 'blue' : 'gold'} />
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-xl font-bold uppercase tracking-widest text-arcane-400">Realms of battle</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {[...CATEGORIES, MIXED_CATEGORY].map((c) => (
            <div key={c.id} className="panel !p-3 text-center transition hover:-translate-y-1 hover:shadow-glow">
              <div className="text-2xl">{c.glyph}</div>
              <div className="mt-1 text-sm font-bold">{c.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ['Private rooms', 'Create a room, share the 6-character code or invite link, and battle your friends.'],
          ['Public arenas & quick play', 'Browse open arenas or hit Quick Play to be matched into a battle instantly.'],
          ['Fair by design', 'Server-timed rounds, server-side scoring, answers locked on submit, no peeking at answers.'],
        ].map(([t, d]) => (
          <div key={t} className="panel">
            <h3 className="font-display text-lg font-bold text-volt-300">{t}</h3>
            <p className="mt-2 text-slate-300">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
