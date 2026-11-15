import { useEffect, useState } from 'react';
import { AppShell } from './ui/layout/AppShell';
import { Tabs } from './ui/layout/Tabs';
import { AppStateProvider, useAppState } from './state/store';
import type { AppStateProviderProps } from './state/store';
import { CardDbProvider } from './carddb/useCardDb';
import type { CardDb, createCardDbLoader } from './carddb/loader';
import { DeckHeader, NewDeckButton } from './ui/layout/DeckHeader';
import { DeckView } from './ui/deck/DeckView';
import { GroupsView } from './ui/groups/GroupsView';
import { EmptyState } from './ui/common/EmptyState';
import { decodePayload } from './importer/payload';
import type { ImportPayload } from './importer/payload';
import { ImportDialog } from './ui/import/ImportDialog';
import { ImportView } from './ui/import/ImportView';
import { Dialog } from './ui/common/Dialog';

function AppContent() {
  const { activeDeck } = useAppState();
  const [activeTab, setActiveTab] = useState('deck');
  const [incoming, setIncoming] = useState<{ payload: ImportPayload; id: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const openImport = (payload: ImportPayload) => {
    setImportError(null);
    setIncoming(previous => ({ payload, id: (previous?.id ?? 0) + 1 }));
  };
  useEffect(() => {
    const readHash = () => {
      if (!location.hash.startsWith('#import=')) return;
      const encoded = location.hash.slice('#import='.length);
      history.replaceState(null, '', location.pathname + location.search);
      const decoded = decodePayload(encoded);
      if (decoded.ok) openImport(decoded.value);
      else { setIncoming(null); setImportError(decoded.error); }
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, []);
  return (
    <AppShell header={<DeckHeader />}>
      <Tabs
        activeId={activeTab} onSelect={setActiveTab}
        items={[
          { id: 'deck', label: 'デッキ', content: activeDeck
            ? <DeckView key={activeDeck.id} deck={activeDeck} onImport={openImport} />
            : <><EmptyState><p>デッキがありません。新規デッキを作成してください。</p><NewDeckButton /></EmptyState><ImportView onImport={openImport} /></> },
          { id: 'groups', label: 'カードグループ', content: activeDeck
            ? <GroupsView key={activeDeck.id} deck={activeDeck} />
            : <EmptyState>デッキがありません</EmptyState> },
          { id: 'patterns', label: '初動パターン' },
        ]}
      />
      {incoming && <ImportDialog key={incoming.id} payload={incoming.payload} onClose={() => setIncoming(null)}
        onImported={() => { setIncoming(null); setActiveTab('deck'); }} />}
      {importError && <Dialog open title="取り込みエラー" onClose={() => setImportError(null)}><p role="alert">{importError}</p></Dialog>}
    </AppShell>
  );
}

export default function App({ db, loader, ...stateProps }: Omit<AppStateProviderProps, 'children'> & {
  db?: CardDb; loader?: ReturnType<typeof createCardDbLoader>;
} = {}) {
  return <AppStateProvider {...stateProps}>
    <CardDbProvider db={db} loader={loader}><AppContent /></CardDbProvider>
  </AppStateProvider>;
}
