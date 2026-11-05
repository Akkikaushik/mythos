import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { api, boot, Player, sleep } from './helpers';
import type { RunningServer } from '../server/src/app';
import { scoreAnswer } from '../shared/rules';
import type { LeaderboardRow, PlayerStats, PublicRoomInfo, RoomSnapshot } from '../shared/protocol';

let server: RunningServer;
let base: string;

beforeAll(async () => {
  server = await boot();
  base = server.url;
});
afterAll(async () => {
  await server?.close();
});

const settings = (over: Record<string, unknown> = {}) => ({
  categories: ['mixed'],
  difficulty: 'mixed',
  questionCount: 10,
  timerSeconds: 2,
  maxPlayers: 20,
  ...over,
});

async function correctIndex(matchId: string, idx: number): Promise<number> {
  const r = await server.db.query<{ correct_index: number }>(
    'select correct_index from match_questions where match_id = $1 and idx = $2',
    [matchId, idx],
  );
  return r.rows[0].correct_index;
}

async function createRoom(host: Player, body: Record<string, unknown>): Promise<RoomSnapshot> {
  const { status, data } = await host.call<{ room: RoomSnapshot }>('POST', '/api/rooms', body);
  expect(status, data.error).toBe(200);
  return data.room;
}

async function joinAndSubscribe(p: Player, body: Record<string, unknown>) {
  const { status, data } = await p.call<{ room: RoomSnapshot }>('POST', '/api/rooms/join', body);
  expect(status, data.error).toBe(200);
  if (!p.ws) await p.connect();
  const ack = await p.send({ type: 'room.subscribe', roomId: data.room.id });
  expect(ack.ok, ack.error).toBe(true);
  return data.room;
}

describe('auth & access control', () => {
  it('registers, rejects duplicates, logs in, and rejects bad/missing/tampered tokens', async () => {
    const reg = await api<{ token: string }>(base, 'POST', '/api/auth/register', { username: 'Karna', password: 'suryaputra123' });
    expect(reg.status).toBe(200);
    expect((await api(base, 'POST', '/api/auth/register', { username: 'karna', password: 'whatever123' })).status).toBe(409);
    expect((await api(base, 'POST', '/api/auth/register', { username: 'x', password: 'whatever123' })).status).toBe(400);
    expect((await api(base, 'POST', '/api/auth/register', { username: 'Shortpw', password: '123' })).status).toBe(400);
    expect((await api(base, 'POST', '/api/auth/login', { username: 'Karna', password: 'wrong-password' })).status).toBe(401);
    const login = await api<{ token: string; profile: { username: string } }>(base, 'POST', '/api/auth/login', {
      username: 'KARNA',
      password: 'suryaputra123',
    });
    expect(login.status).toBe(200);
    expect(login.data.profile.username).toBe('Karna');
    expect((await api(base, 'GET', '/api/me')).status).toBe(401);
    expect((await api(base, 'GET', '/api/me', undefined, login.data.token)).status).toBe(200);
    const tampered = login.data.token.slice(0, -2) + (login.data.token.endsWith('AA') ? 'BB' : 'AA');
    expect((await api(base, 'GET', '/api/me', undefined, tampered)).status).toBe(401);
    const guest = await api<{ profile: { isGuest: boolean } }>(base, 'POST', '/api/auth/guest');
    expect(guest.status).toBe(200);
    expect(guest.data.profile.isGuest).toBe(true);
  });

  it('rejects websocket messages before authentication and invalid ws tokens', async () => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    await new Promise((r) => ws.once('open', r));
    const first = new Promise<string>((r) => ws.once('message', (m) => r(m.toString())));
    ws.send(JSON.stringify({ type: 'room.start' }));
    expect(JSON.parse(await first)).toMatchObject({ type: 'error', error: 'Authenticate first' });
    const closed = new Promise<number>((r) => ws.once('close', (code) => r(code)));
    ws.send(JSON.stringify({ type: 'auth', token: 'forged.token' }));
    expect(await closed).toBe(4003);
  });

  it('validates room input', async () => {
    const p = await Player.register(base, 'Validator');
    expect((await p.call('POST', '/api/rooms', { name: 'x', settings: settings() })).status).toBe(400);
    expect((await p.call('POST', '/api/rooms', { name: 'Okay Room', settings: settings({ questionCount: 99 }) })).status).toBe(400);
    expect((await p.call('POST', '/api/rooms/join', { code: 'ZZ' })).status).toBe(400);
    expect((await p.call('POST', '/api/rooms/join', { code: 'ZZZZZZ' })).status).toBe(404);
  });
});

describe('rooms, discovery and matchmaking', () => {
  it('private rooms: join by code only; hidden from browser; host-only controls enforced', async () => {
    const host = await Player.register(base, 'Indra');
    const guest = await Player.register(base, 'Agni');
    const outsider = await Player.register(base, 'Vayu');
    const room = await createRoom(host, { name: 'Devaloka', isPublic: false, settings: settings() });
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
    await host.connect();
    await host.send({ type: 'room.subscribe', roomId: room.id });

    // not listed publicly, cannot join by id
    const list = await guest.call<{ rooms: PublicRoomInfo[] }>('GET', '/api/rooms/public');
    expect(list.data.rooms.find((r) => r.id === room.id)).toBeUndefined();
    expect((await guest.call('POST', '/api/rooms/join', { roomId: room.id })).status).toBe(403);

    await joinAndSubscribe(guest, { code: room.code.toLowerCase() });
    const seen = await host.waitFor((r) => r.players.length === 2, 'guest to appear');
    expect(seen.players.find((p) => p.userId === guest.userId)?.connected).toBe(true);

    // non-members cannot subscribe to room state
    await outsider.connect();
    const sub = await outsider.send({ type: 'room.subscribe', roomId: room.id });
    expect(sub).toMatchObject({ ok: false, error: 'You are not a member of this room' });

    // host-only actions
    expect(await guest.send({ type: 'room.start' })).toMatchObject({ ok: false, error: 'Only the host can do that' });
    expect(await guest.send({ type: 'room.settings', settings: settings() })).toMatchObject({ ok: false });
    expect(await guest.send({ type: 'room.kick', userId: host.userId })).toMatchObject({ ok: false });
    expect((await host.send({ type: 'room.settings', settings: settings({ timerSeconds: 999 }) })).ok).toBe(false);
    const upd = await host.send({ type: 'room.settings', settings: settings({ timerSeconds: 15 }), name: 'Swarga' });
    expect(upd.ok).toBe(true);
    await guest.waitFor((r) => r.name === 'Swarga' && r.settings.timerSeconds === 15, 'settings sync');

    // kick + ban
    expect((await host.send({ type: 'room.kick', userId: guest.userId })).ok).toBe(true);
    await sleep(50);
    expect(guest.removed).toBe('kicked');
    expect((await guest.call('POST', '/api/rooms/join', { code: room.code })).status).toBe(403);

    await Promise.all([host.disconnect(), guest.disconnect(), outsider.disconnect()]);
  });

  it('public rooms are discoverable, live-updated, capacity-limited, and quick-play fills them', async () => {
    const host = await Player.register(base, 'Odin');
    const watcher = await Player.register(base, 'Frigg');
    await watcher.connect();
    expect((await watcher.send({ type: 'lobby.subscribe' })).ok).toBe(true);

    const room = await createRoom(host, { name: 'Asgard Arena', isPublic: true, settings: settings({ maxPlayers: 3 }) });
    await host.connect();
    await host.send({ type: 'room.subscribe', roomId: room.id });

    const list = await watcher.call<{ rooms: PublicRoomInfo[] }>('GET', '/api/rooms/public');
    const info = list.data.rooms.find((r) => r.id === room.id);
    expect(info).toMatchObject({ name: 'Asgard Arena', playerCount: 1, maxPlayers: 3, status: 'lobby', hostName: 'Odin' });
    // live lobby push
    await sleep(400);
    expect(watcher.lobbyRooms.some((r) => r.id === room.id)).toBe(true);

    // quick play joins the existing public room (it has a connected host and free slots)
    const q1 = await Player.register(base, 'Thor');
    const qp = await q1.call<{ room: RoomSnapshot }>('POST', '/api/rooms/quickplay');
    expect(qp.status).toBe(200);
    expect(qp.data.room.id).toBe(room.id);

    const q2 = await Player.register(base, 'Loki');
    expect((await q2.call<{ room: RoomSnapshot }>('POST', '/api/rooms/join', { roomId: room.id })).data.room.id).toBe(room.id);

    // room is now full (3/3)
    const q3 = await Player.register(base, 'Baldur');
    const full = await q3.call('POST', '/api/rooms/join', { code: room.code });
    expect(full.status).toBe(409);
    expect(full.data.error).toBe('Room is full');

    // quick play with no suitable room creates a new public room
    const created = await q3.call<{ room: RoomSnapshot }>('POST', '/api/rooms/quickplay');
    expect(created.status).toBe(200);
    expect(created.data.room.id).not.toBe(room.id);
    expect(created.data.room.isPublic).toBe(true);
    expect(created.data.room.hostId).toBe(q3.userId);

    await Promise.all([host.disconnect(), watcher.disconnect()]);
  });

  it('migrates the host when the host disconnects from the lobby', async () => {
    const host = await Player.register(base, 'Zeus');
    const p = await Player.register(base, 'Hera');
    const room = await createRoom(host, { name: 'Olympus', settings: settings() });
    await host.connect();
    await host.send({ type: 'room.subscribe', roomId: room.id });
    await joinAndSubscribe(p, { code: room.code });
    await host.disconnect();
    const st = await p.waitFor((r) => r.hostId === p.userId, 'host migration', 3000);
    expect(st.players.find((x) => x.userId === host.userId)?.connected).toBe(false);
    expect(st.players.find((x) => x.userId === p.userId)?.isHost).toBe(true);
    // old host can still reconnect as a regular member
    await host.connect();
    expect((await host.send({ type: 'room.subscribe', roomId: room.id })).ok).toBe(true);
    expect((await host.send({ type: 'room.start' })).ok).toBe(false);
    await Promise.all([host.disconnect(), p.disconnect()]);
  });
});

describe('full multiplayer battle', () => {
  it('runs a 4-player, 10-question match with server-side scoring, anti-cheat, reconnection and leaderboards', async () => {
    const [A, B, C, D] = await Promise.all(['Arjuna', 'Bhima', 'Chitra', 'Drona'].map((n) => Player.register(base, n)));
    const room = await createRoom(A, { name: 'Kurukshetra', settings: settings() });
    await A.connect();
    await A.send({ type: 'room.subscribe', roomId: room.id });
    for (const p of [B, C, D]) await joinAndSubscribe(p, { code: room.code });
    await A.waitFor((r) => r.players.length === 4 && r.players.every((p) => p.connected), 'all connected');

    expect((await A.send({ type: 'room.start' })).ok).toBe(true);
    // double start is rejected
    expect((await A.send({ type: 'room.start' })).ok).toBe(false);
    const started = await B.waitFor((r) => r.status === 'in_progress', 'start sync');
    const matchId = started.match!.id;

    // late joiners cannot enter an in-progress battle
    const E = await Player.register(base, 'Eklavya');
    const late = await E.call('POST', '/api/rooms/join', { code: room.code });
    expect(late.status).toBe(409);

    let cScoreBeforeDrop = 0;
    for (let i = 0; i < 10; i++) {
      const states = await Promise.all(
        [A, B, C, D].map((p) => p.waitFor((r) => r.match?.phase === 'question' && r.match.questionIndex === i, `q${i} open`)),
      );
      // every client sees identical, server-stamped round timestamps (timer sync)
      const q0 = states[0].match!.question!;
      for (const s of states) {
        expect(s.match!.question!.openedAt).toBe(q0.openedAt);
        expect(s.match!.question!.closesAt).toBe(q0.closesAt);
      }
      expect(q0.closesAt - q0.openedAt).toBe(2000);
      expect(q0.options).toHaveLength(4);
      // correct answer & explanation are never sent while the round is open
      const wire = JSON.stringify(states[0]);
      expect(wire).not.toContain('correctIndex');
      expect(wire).not.toContain('explanation');

      const correct = await correctIndex(matchId, i);
      const wrong = (correct + 1) % 4;

      if (i === 3) {
        // C drops mid-question, others see the disconnect, C reconnects and resumes
        cScoreBeforeDrop = A.room!.players.find((p) => p.userId === C.userId)!.score;
        await C.disconnect();
        await A.waitFor((r) => r.players.find((p) => p.userId === C.userId)?.connected === false, 'C offline');
        await C.connect();
        expect((await C.send({ type: 'room.subscribe', roomId: room.id })).ok).toBe(true);
        const resumed = await C.waitFor((r) => r.match !== null, 'C resumed');
        expect(resumed.match!.questionIndex).toBeGreaterThanOrEqual(3);
        expect(resumed.players.find((p) => p.userId === C.userId)!.score).toBe(cScoreBeforeDrop);
      }

      const sends: Promise<{ ok: boolean; error?: string }>[] = [];
      if (i === 0) {
        // simultaneous duplicate submissions from the same player: exactly one wins
        const dup = await Promise.all([
          A.send({ type: 'answer', questionIndex: 0, choice: correct }),
          A.send({ type: 'answer', questionIndex: 0, choice: wrong }),
        ]);
        expect(dup.filter((d) => d.ok)).toHaveLength(1);
        expect(dup.find((d) => !d.ok)?.error).toBe('Answer already locked in');
        expect(dup[0].ok).toBe(true);
      } else {
        sends.push(A.send({ type: 'answer', questionIndex: i, choice: correct }));
      }
      // simultaneous answers from different players
      sends.push(B.send({ type: 'answer', questionIndex: i, choice: wrong }));
      if (i % 2 === 0 || i === 3) sends.push(C.send({ type: 'answer', questionIndex: i, choice: correct }));
      // wrong question index and out-of-range options are rejected
      if (i === 1) {
        expect((await D.send({ type: 'answer', questionIndex: 0, choice: 0 })).ok).toBe(false);
        expect((await D.send({ type: 'answer', questionIndex: 1, choice: 7 })).ok).toBe(false);
      }
      const acks = await Promise.all(sends);
      for (const a of acks) expect(a.ok, a.error).toBe(true);
      // acks never reveal correctness
      expect(JSON.stringify(acks)).not.toMatch(/correct/i);

      const reveal = await A.waitFor((r) => r.match?.phase === 'reveal' && r.match.reveal?.index === i, `q${i} reveal`);
      expect(reveal.match!.reveal!.correctIndex).toBe(correct);
      expect(reveal.match!.reveal!.explanation.length).toBeGreaterThan(5);
      const rA = reveal.match!.reveal!.results.find((r) => r.userId === A.userId)!;
      expect(rA.correct).toBe(true);
      expect(rA.points).toBeGreaterThanOrEqual(100);
      expect(reveal.match!.reveal!.results.find((r) => r.userId === D.userId)).toMatchObject({ choice: null, points: 0 });

      if (i === 0) {
        // late answer after the round closed
        expect(await D.send({ type: 'answer', questionIndex: 0, choice: correct })).toMatchObject({
          ok: false,
          error: 'This question is closed',
        });
      }
    }

    const final = await A.waitFor((r) => r.match?.phase === 'finished', 'finish', 15_000);
    const standings = final.match!.standings!;
    expect(standings.map((s) => s.userId)[0]).toBe(A.userId);
    expect(final.status).toBe('finished');
    await server.engine.flush();

    // ---- recompute every score from the persisted answers and compare (server-side scoring audit)
    const { rows: answers } = await server.db.query<{
      user_id: string;
      idx: number;
      is_correct: boolean;
      response_ms: number;
      points: number;
    }>('select user_id, idx, is_correct, response_ms, points from answers where match_id = $1 order by idx', [matchId]);
    const totals = new Map<string, number>();
    for (const p of [A, B, C, D]) {
      let streak = 0;
      let total = 0;
      for (let i = 0; i < 10; i++) {
        const a = answers.find((x) => x.user_id === p.userId && x.idx === i);
        if (!a) {
          streak = 0;
          continue;
        }
        const s = scoreAnswer({ correct: a.is_correct, responseMs: a.response_ms, durationMs: 2000, previousStreak: streak });
        expect(a.points).toBe(s.points);
        streak = s.streak;
        total += s.points;
      }
      totals.set(p.userId, total);
      expect(standings.find((s) => s.userId === p.userId)!.score).toBe(total);
    }
    expect(answers.filter((a) => a.user_id === A.userId)).toHaveLength(10);
    expect(answers.filter((a) => a.user_id === B.userId).every((a) => a.points === 0)).toBe(true);
    expect(answers.filter((a) => a.user_id === D.userId)).toHaveLength(0);
    // A got 10 in a row: streak bonus must have kicked in (>= 10 * 100 + streak bonuses 10+20+30+40+50*5)
    expect(totals.get(A.userId)!).toBeGreaterThanOrEqual(1000 + 350);

    // ---- stats
    const statsA = (await A.call<{ stats: PlayerStats }>('GET', `/api/players/${A.userId}`)).data.stats;
    expect(statsA).toMatchObject({ matchesPlayed: 1, wins: 1, losses: 0, correctAnswers: 10, questionsFaced: 10, accuracy: 1 });
    expect(statsA.totalPoints).toBe(totals.get(A.userId));
    expect(statsA.highestScore).toBe(totals.get(A.userId));
    expect(statsA.currentWinStreak).toBe(1);
    const statsB = (await A.call<{ stats: PlayerStats }>('GET', `/api/players/${B.userId}`)).data.stats;
    expect(statsB).toMatchObject({ matchesPlayed: 1, wins: 0, losses: 1, correctAnswers: 0, accuracy: 0, totalPoints: 0 });

    // ---- leaderboards (daily/weekly/all include this match)
    for (const period of ['daily', 'weekly', 'all']) {
      const lb = await A.call<{ rows: LeaderboardRow[] }>('GET', `/api/leaderboard?period=${period}`);
      expect(lb.status).toBe(200);
      const rowA = lb.data.rows.find((r) => r.userId === A.userId)!;
      expect(rowA.points).toBe(totals.get(A.userId));
      expect(rowA.wins).toBe(1);
      const rowC = lb.data.rows.find((r) => r.userId === C.userId)!;
      expect(rowC.points).toBe(totals.get(C.userId));
      expect(rowA.rank).toBeLessThan(rowC.rank);
    }
    expect((await A.call('GET', '/api/leaderboard?period=yearly')).status).toBe(400);

    // ---- history
    const hist = await D.call<{ history: { matchId: string; rank: number; won: boolean }[] }>('GET', '/api/me/history');
    expect(hist.data.history[0]).toMatchObject({ matchId, rank: 4, won: false });

    // ---- XP awarded and play again resets the room
    const me = await A.call<{ profile: { xp: number; level: number } }>('GET', '/api/me');
    expect(me.data.profile.xp).toBe(standings[0].xpGained);
    expect((await B.send({ type: 'room.playAgain' })).ok).toBe(false);
    expect((await A.send({ type: 'room.playAgain' })).ok).toBe(true);
    await B.waitFor((r) => r.status === 'lobby' && r.match === null, 'play again');

    await Promise.all([A, B, C, D].map((p) => p.disconnect()));
  });

  it('keeps the match running when the host disconnects mid-battle and hands over the crown', async () => {
    const H = await Player.register(base, 'Ravana');
    const P = await Player.register(base, 'Hanuman');
    const room = await createRoom(H, { name: 'Lanka', settings: settings({ timerSeconds: 1 }) });
    await H.connect();
    await H.send({ type: 'room.subscribe', roomId: room.id });
    await joinAndSubscribe(P, { code: room.code });
    await H.waitFor((r) => r.players.length === 2 && r.players.every((p) => p.connected), 'both connected');
    expect((await H.send({ type: 'room.start' })).ok).toBe(true);
    await P.waitFor((r) => r.match?.phase === 'question', 'first question');
    await H.disconnect();

    let answered = 0;
    while (true) {
      const st = await P.waitFor(
        (r) => r.match?.phase === 'finished' || (r.match?.phase === 'question' && r.match.myAnswer === null),
        'next question or finish',
      );
      if (st.match!.phase === 'finished') break;
      const ack = await P.send({ type: 'answer', questionIndex: st.match!.questionIndex, choice: 0 });
      if (ack.ok) answered++;
    }
    expect(answered).toBeGreaterThanOrEqual(9);
    const fin = await P.waitFor((r) => r.hostId === P.userId, 'crown handed over', 3000);
    expect(fin.match!.standings!.map((s) => s.userId).sort()).toEqual([H.userId, P.userId].sort());
    await server.engine.flush();
    const { rows } = await server.db.query<{ status: string }>('select status from matches where room_id = $1', [room.id]);
    expect(rows[0].status).toBe('finished');
    await P.disconnect();
  });

  it('ping/pong exposes server time for clock-offset estimation', async () => {
    const p = await Player.register(base, 'Chronos');
    await p.connect();
    const t0 = Date.now();
    p.ws!.send(JSON.stringify({ type: 'ping', t: t0 }));
    await sleep(100);
    const pong = p.messages.find((m) => m.type === 'pong');
    expect(pong).toBeDefined();
    if (pong?.type === 'pong') {
      expect(pong.t).toBe(t0);
      expect(Math.abs(pong.serverNow - Date.now())).toBeLessThan(1000);
    }
    await p.disconnect();
  });
});

describe('rate limiting', () => {
  it('throttles repeated auth attempts from one IP when enabled', async () => {
    const limited = await boot({ rateLimits: true });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        statuses.push((await api(limited.url, 'POST', '/api/auth/login', { username: 'nobody', password: 'nope-nope' })).status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
    } finally {
      await limited.close();
    }
  });
});
