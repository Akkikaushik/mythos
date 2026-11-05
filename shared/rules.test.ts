import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  estimateClockOffset,
  generateRoomCode,
  isValidRoomCode,
  levelForXp,
  levelProgress,
  normalizeRoomCode,
  rankPlayers,
  remainingMs,
  scoreAnswer,
  speedBonus,
  streakBonus,
  validateRoomName,
  validateSettings,
  validateUsername,
  xpForMatch,
} from './rules';

describe('scoring', () => {
  it('awards 0 for wrong answers and resets streak', () => {
    expect(scoreAnswer({ correct: false, responseMs: 100, durationMs: 20000, previousStreak: 4 })).toEqual({
      points: 0,
      base: 0,
      speedBonus: 0,
      streakBonus: 0,
      streak: 0,
    });
  });

  it('gives 100 + full speed bonus for an instant correct answer', () => {
    const r = scoreAnswer({ correct: true, responseMs: 0, durationMs: 20000, previousStreak: 0 });
    expect(r).toMatchObject({ points: 150, base: 100, speedBonus: 50, streakBonus: 0, streak: 1 });
  });

  it('speed bonus decays linearly and is clamped', () => {
    expect(speedBonus(10000, 20000)).toBe(25);
    expect(speedBonus(20000, 20000)).toBe(0);
    expect(speedBonus(99999, 20000)).toBe(0);
    expect(speedBonus(-50, 20000)).toBe(50);
    expect(speedBonus(100, 0)).toBe(0);
  });

  it('streak bonus starts on the 2nd consecutive correct answer and caps at 50', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 10].map(streakBonus)).toEqual([0, 10, 20, 30, 40, 50, 50, 50]);
    const r = scoreAnswer({ correct: true, responseMs: 20000, durationMs: 20000, previousStreak: 2 });
    expect(r).toMatchObject({ points: 120, streak: 3, streakBonus: 20 });
  });

  it('maximum per-question score is 200 (100 + 50 speed + 50 streak)', () => {
    expect(scoreAnswer({ correct: true, responseMs: 0, durationMs: 20000, previousStreak: 50 }).points).toBe(200);
  });
});

describe('ranking', () => {
  it('orders by score, then correct, then speed, then join order', () => {
    const ranked = rankPlayers([
      { userId: 'a', score: 300, correct: 2, totalResponseMs: 5000, joinedAt: 1 },
      { userId: 'b', score: 300, correct: 3, totalResponseMs: 9000, joinedAt: 2 },
      { userId: 'c', score: 300, correct: 3, totalResponseMs: 4000, joinedAt: 3 },
      { userId: 'd', score: 500, correct: 1, totalResponseMs: 1, joinedAt: 4 },
    ]);
    expect(ranked.map((p) => [p.userId, p.rank])).toEqual([
      ['d', 1],
      ['c', 2],
      ['b', 3],
      ['a', 4],
    ]);
  });
});

describe('progression', () => {
  it('xp: participation + points/10 + win bonus only with opponents', () => {
    expect(xpForMatch(1234, true, 3)).toBe(20 + 123 + 100);
    expect(xpForMatch(1234, true, 1)).toBe(20 + 123);
    expect(xpForMatch(0, false, 5)).toBe(20);
  });
  it('levels grow quadratically', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(400)).toBe(3);
    expect(levelProgress(250)).toMatchObject({ level: 2, current: 150, needed: 300 });
  });
});

describe('room codes', () => {
  it('generates valid 6-char codes without ambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateRoomCode();
      expect(isValidRoomCode(c)).toBe(true);
      expect(c).not.toMatch(/[01OI]/);
    }
  });
  it('normalizes user input', () => {
    expect(normalizeRoomCode(' ab-c2 3d ')).toBe('ABC23D');
    expect(isValidRoomCode('ABC')).toBe(false);
  });
});

describe('validation', () => {
  it('accepts defaults and rejects out-of-range settings', () => {
    expect(validateSettings(DEFAULT_SETTINGS).ok).toBe(true);
    expect(validateSettings({ ...DEFAULT_SETTINGS, questionCount: 9 }).ok).toBe(false);
    expect(validateSettings({ ...DEFAULT_SETTINGS, questionCount: 16 }).ok).toBe(false);
    expect(validateSettings({ ...DEFAULT_SETTINGS, timerSeconds: 5 }).ok).toBe(false);
    expect(validateSettings({ ...DEFAULT_SETTINGS, maxPlayers: 21 }).ok).toBe(false);
    expect(validateSettings({ ...DEFAULT_SETTINGS, categories: [] }).ok).toBe(false);
    expect(validateSettings({ ...DEFAULT_SETTINGS, categories: ['nope'] }).ok).toBe(false);
    expect(validateSettings({ ...DEFAULT_SETTINGS, difficulty: 'insane' }).ok).toBe(false);
    expect(validateSettings({ ...DEFAULT_SETTINGS, timerSeconds: 20.5 }).ok).toBe(false);
  });
  it('collapses mixed + others to mixed and dedupes', () => {
    const r = validateSettings({ ...DEFAULT_SETTINGS, categories: ['science', 'mixed'] });
    expect(r.ok && r.value.categories).toEqual(['mixed']);
    const r2 = validateSettings({ ...DEFAULT_SETTINGS, categories: ['science', 'science', 'anime'] });
    expect(r2.ok && r2.value.categories).toEqual(['science', 'anime']);
  });
  it('validates usernames and room names', () => {
    expect(validateUsername('Arjuna_01').ok).toBe(true);
    expect(validateUsername('ab').ok).toBe(false);
    expect(validateUsername('<script>').ok).toBe(false);
    expect(validateRoomName('  Arena   of  Gods ')).toEqual({ ok: true, value: 'Arena of Gods' });
    expect(validateRoomName('<b>hi</b>').ok).toBe(false);
  });
});

describe('clock sync', () => {
  it('estimates offset from round trip midpoint', () => {
    // client sent at 1000, server stamped 6050, client received at 1100 => server is ~5000ms ahead
    expect(estimateClockOffset(1000, 6050, 1100)).toBe(5000);
    expect(remainingMs(10_000, 4000, 5000)).toBe(1000);
    expect(remainingMs(10_000, 6000, 5000)).toBe(0);
  });
});
