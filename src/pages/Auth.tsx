import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { Button, ErrorNote, Field, Panel } from '../components/ui';
import { AvatarPicker } from '../components/AvatarPicker';
import { validatePassword, validateUsername, type AvatarId } from '../../shared/rules';

export default function AuthPage() {
  const { profile, login, register, guest } = useAuth();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>(params.get('mode') === 'register' ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>('ronin');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'form' | 'guest' | null>(null);
  const next = params.get('next') || '/hub';

  useEffect(() => setError(null), [mode]);
  if (profile) return <Navigate to={next.startsWith('/') ? next : '/hub'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register') {
      const u = validateUsername(username);
      if (!u.ok) return setError(u.error);
      const p = validatePassword(password);
      if (!p.ok) return setError(p.error);
    }
    setBusy('form');
    try {
      if (mode === 'login') await login(username, password);
      else await register(username, password, avatar);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const asGuest = async () => {
    setBusy('guest');
    setError(null);
    try {
      await guest();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-md animate-rise">
      <Panel glow="blue">
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-void-950/70 p-1" role="tablist">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-lg py-2 font-display text-sm font-bold uppercase tracking-widest transition ${
                mode === m ? 'bg-gradient-to-r from-arcane-600 to-volt-500 text-white shadow-glow' : 'text-slate-400 hover:text-volt-300'
              }`}
            >
              {m === 'login' ? 'Sign in' : 'Register'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Warrior name"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. Arjuna_7"
            maxLength={20}
            required
            hint={mode === 'register' ? '3-20 letters, numbers or underscore' : undefined}
          />
          <Field
            label="Password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'register' ? 8 : undefined}
            maxLength={128}
            hint={mode === 'register' ? 'At least 8 characters' : undefined}
          />
          {mode === 'register' ? (
            <div>
              <span className="mb-2 block text-sm font-semibold uppercase tracking-wider text-arcane-400">Choose your avatar</span>
              <AvatarPicker value={avatar} onChange={setAvatar} />
            </div>
          ) : null}
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" className="w-full" loading={busy === 'form'}>
            {mode === 'login' ? 'Enter the arena' : 'Forge my legend'}
          </Button>
        </form>
        <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-slate-500">
          <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
        </div>
        <Button variant="ghost" className="w-full" onClick={asGuest} loading={busy === 'guest'}>
          Play as guest
        </Button>
        <p className="mt-3 text-center text-xs text-slate-500">Guest progress is tied to this browser.</p>
      </Panel>
    </div>
  );
}
