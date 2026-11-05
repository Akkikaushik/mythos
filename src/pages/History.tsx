import { useEffect, useState } from 'react';
import { backend } from '../lib/api';
import { ErrorNote, PageTitle, Panel, Spinner } from '../components/ui';
import { HistoryTable } from '../components/HistoryTable';
import type { MatchHistoryItem } from '../../shared/protocol';

export default function History() {
  const [items, setItems] = useState<MatchHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    backend
      .history()
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  }, []);
  return (
    <div>
      <PageTitle kicker="CHRONICLE" title="Match history" />
      <ErrorNote>{error}</ErrorNote>
      <Panel>{items ? <HistoryTable items={items} /> : <Spinner />}</Panel>
    </div>
  );
}
