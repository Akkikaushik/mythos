import { useEffect, useMemo, useRef, useState } from 'react';
import { backend } from '../../lib/api';
import { useServerNow } from '../../hooks/useRealtime';
import { useToast } from '../../state/toast';
import { usePrefs } from '../../lib/prefs';
import { sfx } from '../../lib/sfx';
import { PlayerBoard } from '../../components/PlayerBoard';
import { Chip, Panel } from '../../components/ui';
import { categoryLabel } from '../../../shared/rules';
import type { RoomSnapshot } from '../../../shared/protocol';

const KEYS = ['A', 'B', 'C', 'D'];

function TimerRing({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  const pct = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const secs = Math.ceil(remainingMs / 1000);
  const color = pct > 0.5 ? '#38d5ff' : pct > 0.25 ? '#ffd34d' : '#ff2d55';
  return (
    <div className="relative h-20 w-20" role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dashoffset .1s linear, stroke .3s' }}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-display text-2xl font-black ${pct <= 0.25 ? 'animate-pulse text-blood-400' : ''}`}>
        {secs}
      </span>
    </div>
  );
}

export default function Arena({ room, meId }: { room: RoomSnapshot; meId: string }) {
  const m = room.match!;
  const toast = useToast();
  const prefs = usePrefs();
  const live = m.phase === 'countdown' || m.phase === 'question' || m.phase === 'reveal';
  const now = useServerNow(live);
  const remaining = Math.max(0, m.phaseEndsAt - now);
  const [pending, setPending] = useState<{ index: number; choice: number } | null>(null);
  const lastTick = useRef<number>(-1);
  const lastReveal = useRef<number>(-1);

  const myChoice = m.myAnswer?.index === m.questionIndex ? m.myAnswer.choice : pending?.index === m.questionIndex ? pending.choice : null;
  const reveal = m.phase === 'reveal' ? m.reveal : null;
  const myResult = reveal?.results.find((r) => r.userId === meId);
  const isParticipant = reveal ? !!myResult : true;
  const revealPoints = useMemo(() => (reveal ? new Map(reveal.results.map((r) => [r.userId, r.points])) : undefined), [reveal]);
  const connected = room.players.filter((p) => p.connected).length;
  const answeredCount = room.players.filter((p) => p.answered).length;

  // sound cues
  useEffect(() => {
    if (m.phase !== 'question') return;
    const s = Math.ceil(remaining / 1000);
    if (s <= 5 && s > 0 && s !== lastTick.current && myChoice === null) {
      lastTick.current = s;
      sfx.tick();
    }
  }, [remaining, m.phase, myChoice]);
  useEffect(() => {
    if (reveal && reveal.index !== lastReveal.current) {
      lastReveal.current = reveal.index;
      if (myResult?.correct) sfx.correct();
      else sfx.wrong();
    }
  }, [reveal, myResult]);

  const answer = async (choice: number) => {
    if (m.phase !== 'question' || myChoice !== null || remaining <= 0) return;
    const index = m.questionIndex;
    setPending({ index, choice });
    sfx.lock();
    const ack = await backend.realtime.send({ type: 'answer', questionIndex: index, choice });
    if (!ack.ok) {
      setPending(null);
      toast(ack.error ?? 'Answer rejected', 'error');
    }
  };

  // keyboard shortcuts 1-4 / A-D
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toUpperCase();
      const idx = ['1', '2', '3', '4'].indexOf(k) >= 0 ? ['1', '2', '3', '4'].indexOf(k) : KEYS.indexOf(k);
      if (idx >= 0) void answer(idx);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-xs tracking-[0.35em] text-volt-300">{room.name.toUpperCase()}</p>
            <p className="font-display text-2xl font-black">
              {m.phase === 'countdown' ? 'Prepare for battle' : `Question ${m.questionIndex + 1} / ${m.questionCount}`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-slate-400">
              <span className="text-emerald-400">●</span> {connected} online
              {m.phase === 'question' ? ` · ${answeredCount}/${room.players.length} locked` : ''}
            </span>
            {m.phase === 'question' ? <TimerRing remainingMs={remaining} totalMs={m.timerSeconds * 1000} /> : null}
          </div>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-arcane-500 via-volt-400 to-aura-400 transition-all duration-500"
            style={{ width: `${((m.questionIndex + (m.phase === 'reveal' ? 1 : 0)) / m.questionCount) * 100}%` }}
          />
        </div>

        {m.phase === 'countdown' ? (
          <Panel glow="gold" className="flex min-h-[340px] flex-col items-center justify-center text-center">
            <p className="font-display text-sm tracking-[0.5em] text-aura-300">THE BATTLE BEGINS IN</p>
            <p key={Math.ceil(remaining / 1000)} className="title-glow animate-burst font-display text-9xl font-black">
              {Math.max(1, Math.ceil(remaining / 1000))}
            </p>
            <p className="text-slate-400">
              {m.questionCount} questions · {m.timerSeconds}s each · {room.players.length} warriors
            </p>
          </Panel>
        ) : m.question ? (
          <Panel key={m.question.index} className="animate-rise space-y-5">
            <div className="flex flex-wrap gap-2">
              <Chip tone="volt">{categoryLabel(m.question.category)}</Chip>
              <Chip tone={m.question.difficulty === 'hard' ? 'blood' : m.question.difficulty === 'medium' ? 'aura' : 'arcane'}>
                {m.question.difficulty}
              </Chip>
            </div>
            <h2 className="text-2xl font-bold leading-snug sm:text-3xl">{m.question.text}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {m.question.options.map((opt, i) => {
                let cls = '';
                if (reveal) {
                  if (i === reveal.correctIndex) cls = 'correct';
                  else if (i === myChoice) cls = 'wrong';
                  else cls = 'faded';
                } else if (i === myChoice) cls = 'selected';
                else if (myChoice !== null) cls = 'faded';
                return (
                  <button
                    key={i}
                    className={`option ${cls}`}
                    disabled={m.phase !== 'question' || myChoice !== null || remaining <= 0 || !isParticipant}
                    onClick={() => answer(i)}
                    aria-pressed={i === myChoice}
                  >
                    <span className="option-key">{KEYS[i]}</span>
                    <span>{opt}</span>
                    {reveal && i === reveal.correctIndex ? <span className="ml-auto text-xl">✦</span> : null}
                  </button>
                );
              })}
            </div>

            {m.phase === 'question' ? (
              <p className="text-center text-sm font-semibold text-slate-400">
                {myChoice !== null ? (
                  <span className="text-volt-300">Answer locked in. Waiting for the round to close…</span>
                ) : (
                  'Choose wisely - answers cannot be changed. Keys 1-4 or A-D work too.'
                )}
              </p>
            ) : null}

            {reveal ? (
              <div className="animate-rise space-y-3">
                <div
                  className={`rounded-xl border px-4 py-3 text-center font-display text-xl font-black uppercase tracking-widest ${
                    myResult?.correct
                      ? 'border-aura-400/60 bg-aura-400/10 text-aura-300 shadow-glow-gold'
                      : 'border-blood-500/50 bg-blood-500/10 text-blood-400'
                  }`}
                >
                  {myResult?.correct ? (
                    <>
                      Critical hit! +{myResult.points}
                      <span className="mt-1 block font-body text-sm font-semibold normal-case tracking-normal text-aura-300/80">
                        100 base · +{myResult.speedBonus} speed{myResult.streakBonus ? ` · +${myResult.streakBonus} streak` : ''}
                      </span>
                    </>
                  ) : myResult?.choice === null ? (
                    'Time ran out - no points'
                  ) : (
                    'Missed - no points'
                  )}
                </div>
                {prefs.showExplanations ? (
                  <p className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-slate-300">
                    <span className="font-bold text-volt-300">Lore: </span>
                    {reveal.explanation}
                  </p>
                ) : null}
                <p className="text-center text-sm text-slate-500">
                  {m.questionIndex + 1 < m.questionCount ? `Next question in ${Math.ceil(remaining / 1000)}s` : 'Final results incoming…'}
                </p>
              </div>
            ) : null}
          </Panel>
        ) : null}
      </div>

      <aside>
        <Panel className="lg:sticky lg:top-24">
          <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-widest text-volt-300">Live leaderboard</h2>
          <PlayerBoard players={room.players} meId={meId} phase={m.phase} revealPoints={revealPoints} />
        </Panel>
      </aside>
    </div>
  );
}
