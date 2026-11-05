/**
 * Local testing tool: connects N extra REAL clients (HTTP + WebSocket) to a room
 * so you can try a multiplayer battle alone. Bots answer a random option after a
 * random delay - they have no access to correct answers.
 *
 *   npm run bots -- <ROOM_CODE> [count=3] [serverUrl=http://localhost:3001]
 */
import WebSocket from 'ws';
import type { RoomSnapshot, ServerMessage } from '../shared/protocol';

const [code, countArg, urlArg] = process.argv.slice(2);
if (!code) {
  console.error('usage: npm run bots -- <ROOM_CODE> [count] [serverUrl]');
  process.exit(1);
}
const count = Math.min(19, Math.max(1, Number(countArg ?? 3)));
const base = (urlArg ?? 'http://localhost:3001').replace(/\/$/, '');

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

async function bot(i: number) {
  const { token, profile } = await post<{ token: string; profile: { username: string } }>('/api/auth/guest', {});
  const { room } = await post<{ room: RoomSnapshot }>('/api/rooms/join', { code }, token);
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
  let answered = -1;
  ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString()) as ServerMessage;
    if (msg.type === 'hello') ws.send(JSON.stringify({ type: 'room.subscribe', roomId: room.id }));
    if (msg.type === 'room.removed') {
      console.log(`[bot ${i}] removed (${msg.reason})`);
      ws.close();
    }
    if (msg.type !== 'room.state') return;
    const m = msg.room.match;
    if (m?.phase === 'question' && m.question && answered !== m.questionIndex) {
      answered = m.questionIndex;
      const idx = m.questionIndex;
      const delay = 1000 + Math.random() * (m.timerSeconds * 1000 * 0.6);
      setTimeout(() => ws.send(JSON.stringify({ type: 'answer', questionIndex: idx, choice: Math.floor(Math.random() * 4) })), delay);
    }
  });
  ws.on('close', () => console.log(`[bot ${i}] disconnected`));
  console.log(`[bot ${i}] ${profile.username} joined ${room.name} (${room.code})`);
}

for (let i = 1; i <= count; i++) await bot(i).catch((e) => console.error(`[bot ${i}]`, (e as Error).message));
console.log('Bots running. Press Ctrl+C to stop.');
