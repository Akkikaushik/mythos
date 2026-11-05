import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { useConnectionStatus } from '../hooks/useRealtime';
import { Avatar, RankBadge } from './Avatar';
import { EnergyField } from './EnergyField';

const NAV = [
  { to: '/hub', label: 'Lobby' },
  { to: '/rooms', label: 'Rooms' },
  { to: '/leaderboard', label: 'Rankings' },
  { to: '/history', label: 'History' },
  { to: '/settings', label: 'Settings' },
];

export function Logo() {
  return (
    <Link to="/" className="group flex items-center gap-2" aria-label="MYTHOS home">
      <img src="/favicon.svg" alt="" className="h-8 w-8 drop-shadow-[0_0_10px_rgba(155,92,255,.8)] transition group-hover:rotate-12" />
      <span className="title-glow font-display text-xl font-black tracking-[0.25em]">MYTHOS</span>
    </Link>
  );
}

function ConnectionDot() {
  const s = useConnectionStatus();
  const map = {
    online: ['bg-emerald-400', 'Live'],
    connecting: ['bg-aura-400 animate-pulse', 'Connecting'],
    reconnecting: ['bg-aura-400 animate-pulse', 'Reconnecting'],
    offline: ['bg-blood-500', 'Offline'],
    idle: ['bg-slate-500', 'Idle'],
  } as const;
  const [cls, label] = map[s];
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400" title={`Realtime: ${label}`}>
      <span className={`h-2 w-2 rounded-full ${cls}`} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

export function Layout() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const inArena = loc.pathname.startsWith('/room/');
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      <EnergyField intensity={inArena ? 1.4 : 1} />
      <header className="sticky top-0 z-40 border-b border-arcane-500/20 bg-void-950/70 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          {profile ? (
            <>
              <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
                {NAV.map((n) => (
                  <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    {n.label}
                  </NavLink>
                ))}
              </nav>
              <div className="flex items-center gap-3">
                <ConnectionDot />
                <Link to="/profile" className="flex items-center gap-2 rounded-xl px-2 py-1 transition hover:bg-white/5">
                  <Avatar id={profile.avatar} size={34} ring="blue" />
                  <span className="hidden flex-col leading-tight sm:flex">
                    <span className="font-bold">{profile.username}</span>
                    <RankBadge level={profile.level} />
                  </span>
                </Link>
                <button
                  className="nav-link md:hidden"
                  aria-expanded={open}
                  aria-label="Toggle menu"
                  onClick={() => setOpen((o) => !o)}
                >
                  ☰
                </button>
              </div>
            </>
          ) : (
            <Link to="/auth" className="btn btn-ghost">
              Sign in
            </Link>
          )}
        </div>
        {open && profile ? (
          <nav className="flex flex-col gap-1 border-t border-arcane-500/20 px-4 py-2 md:hidden" aria-label="Mobile">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {n.label}
              </NavLink>
            ))}
            <NavLink to="/profile" onClick={() => setOpen(false)} className="nav-link">
              Profile
            </NavLink>
          </nav>
        ) : null}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
        <Outlet />
      </main>
      <footer className="border-t border-white/5 py-4 text-center text-xs text-slate-500">
        MYTHOS · Arena of Knowledge · questions are original and curated for play
      </footer>
    </div>
  );
}
