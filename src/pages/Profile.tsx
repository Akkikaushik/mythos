import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { backend } from '../lib/api';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';
import { Avatar, RankBadge } from '../components/Avatar';
import { AvatarPicker } from '../components/AvatarPicker';
import { HistoryTable } from '../components/HistoryTable';
import { Button, ErrorNote, Panel, Spinner, Stat } from '../components/ui';
import { levelProgress, rankTier, validateUsername, type AvatarId } from '../../shared/rules';
import type { MatchHistoryItem, PlayerStats, Profile } from '../../shared/protocol';

export default function ProfilePage() {
  const { id } = useParams();
  const { profile: me, setProfile } = useAuth();
  const toast = useToast();
  const targetId = id ?? me?.id ?? '';
  const isMe = targetId === me?.id;
  const [data, setData] = useState<{ profile: Profile; stats: PlayerStats; history: MatchHistoryItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>('ronin');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    backend
      .player(targetId)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [targetId]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }
  const { profile, stats, history } = data;
  const lp = levelProgress(profile.xp);
  const tier = rankTier(lp.level);

  const save = async () => {
    const u = validateUsername(name);
    if (!u.ok) return toast(u.error, 'error');
    setSaving(true);
    try {
      const p = await backend.updateProfile({ username: u.value, avatar });
      setProfile(p);
      setData({ ...data, profile: p });
      setEditing(false);
      toast('Profile updated', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel glow="gold" className="animate-rise">
        <div className="flex flex-wrap items-center gap-6">
          <Avatar id={profile.avatar} size={112} ring="gold" />
          <div className="min-w-[14rem] flex-1">
            <p className="font-display text-xs tracking-[0.35em]" style={{ color: tier.color }}>
              {tier.name.toUpperCase()} · LEVEL {lp.level}
            </p>
            <h1 className="break-all font-display text-3xl font-black sm:text-4xl">{profile.username}</h1>
            <p className="break-all text-xs text-slate-500">
              Player ID <code className="select-all">{profile.id}</code>
              {profile.isGuest ? ' · guest' : ''} · joined {new Date(profile.createdAt).toLocaleDateString()}
            </p>
            <div className="mt-3 h-2.5 max-w-md overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-to-r from-arcane-500 via-volt-400 to-aura-400" style={{ width: `${lp.pct * 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {profile.xp} XP total · {lp.needed - lp.current} XP to level {lp.level + 1}
            </p>
          </div>
          {isMe && !editing ? (
            <Button
              variant="ghost"
              onClick={() => {
                setName(profile.username);
                setAvatar(profile.avatar);
                setEditing(true);
              }}
            >
              Edit profile
            </Button>
          ) : null}
        </div>
        {editing ? (
          <div className="mt-6 space-y-4 border-t border-white/10 pt-4">
            <label className="block max-w-sm">
              <span className="mb-1 block text-sm font-semibold uppercase tracking-wider text-arcane-400">Username</span>
              <input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
            </label>
            <AvatarPicker value={avatar} onChange={setAvatar} />
            <div className="flex gap-2">
              <Button onClick={save} loading={saving}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>

      <div>
        <h2 className="mb-3 font-display text-lg font-bold uppercase tracking-widest text-volt-300">Battle statistics</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <Stat label="Global rank" value={stats.globalRank ? `#${stats.globalRank}` : '–'} tone="aura" />
          <Stat label="Battles" value={stats.matchesPlayed} />
          <Stat label="Wins" value={stats.wins} tone="aura" />
          <Stat label="Losses" value={stats.losses} tone="arcane" />
          <Stat label="Accuracy" value={`${Math.round(stats.accuracy * 100)}%`} />
          <Stat label="Total points" value={stats.totalPoints.toLocaleString()} tone="aura" />
          <Stat label="Highest score" value={stats.highestScore} />
          <Stat label="Win streak" value={stats.currentWinStreak} tone="arcane" />
          <Stat label="Best streak" value={stats.bestWinStreak} />
          <Stat label="Correct" value={`${stats.correctAnswers}/${stats.questionsFaced}`} tone="arcane" />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          <RankBadge level={lp.level} /> Accuracy = correct answers / questions faced. Solo battles count toward points but not wins or losses.
        </p>
      </div>

      <Panel>
        <h2 className="mb-3 font-display text-lg font-bold uppercase tracking-widest text-volt-300">Recent battles</h2>
        <HistoryTable items={history} />
      </Panel>
    </div>
  );
}
