import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { backend } from '../lib/api';
import { useToast } from '../state/toast';

export function useJoin() {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const join = useCallback(
    async (input: { code: string } | { roomId: string }, key = 'join') => {
      setBusy(key);
      try {
        const room = await backend.joinRoom(input);
        navigate(`/room/${room.id}`);
      } catch (e) {
        toast((e as Error).message, 'error');
      } finally {
        setBusy(null);
      }
    },
    [navigate, toast],
  );
  return { join, busy };
}
