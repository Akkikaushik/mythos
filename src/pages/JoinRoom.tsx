import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useJoin } from '../hooks/useJoin';
import { Button, PageTitle, Panel } from '../components/ui';
import { isValidRoomCode, normalizeRoomCode } from '../../shared/rules';

export default function JoinRoom() {
  const params = useParams();
  const { join, busy } = useJoin();
  const [code, setCode] = useState(normalizeRoomCode(params.code ?? ''));
  const [error, setError] = useState<string | null>(null);
  const autoJoined = useRef(false);

  // invite links (/join/ABC123) join automatically
  useEffect(() => {
    const c = normalizeRoomCode(params.code ?? '');
    if (c && isValidRoomCode(c) && !autoJoined.current) {
      autoJoined.current = true;
      void join({ code: c });
    }
  }, [params.code, join]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = normalizeRoomCode(code);
    if (!isValidRoomCode(c)) return setError('Room codes are 6 letters/numbers (no 0, 1, O or I)');
    setError(null);
    void join({ code: c });
  };

  return (
    <div className="mx-auto max-w-md">
      <PageTitle kicker="ANSWER THE SUMMONS" title="Join room" />
      <Panel glow="blue">
        <form onSubmit={submit} className="space-y-4">
          <label htmlFor="code" className="block text-sm font-semibold uppercase tracking-wider text-arcane-400">
            Room code
          </label>
          <input
            id="code"
            autoFocus
            className="input text-center font-display text-3xl uppercase tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(normalizeRoomCode(e.target.value).slice(0, 6))}
            placeholder="······"
            autoComplete="off"
            inputMode="text"
          />
          {error ? <p className="text-sm font-semibold text-blood-400">{error}</p> : null}
          <Button type="submit" className="w-full" loading={busy === 'join'}>
            Enter
          </Button>
        </form>
      </Panel>
    </div>
  );
}
