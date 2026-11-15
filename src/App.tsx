import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AppShell } from './ui/layout/AppShell';
import { Tabs } from './ui/layout/Tabs';
import { AppStateProvider, useAppState, useSaveStatus } from './state/store';
import { ErrorBoundary } from './ui/layout/ErrorBoundary';
import type { AppStateProviderProps } from './state/store';
import { CardDbProvider } from './carddb/useCardDb';
import type { CardDb, createCardDbLoader } from './carddb/loader';
import { DeckHeader, NewDeckButton } from './ui/layout/DeckHeader';
import { DeckView } from './ui/deck/DeckView';
import { GroupsView } from './ui/groups/GroupsView';
import { PatternsView } from './ui/patterns/PatternsView';
import { EffectsView } from './ui/effects/EffectsView';
import { CalculationProvider } from './ui/patterns/CalculationProvider';
import type { EngineWorker } from './engine/client';
import { EmptyState } from './ui/common/EmptyState';
import { decodePayload } from './importer/payload';
import type { ImportPayload } from './importer/payload';
import { ImportDialog } from './ui/import/ImportDialog';
import { ImportView } from './ui/import/ImportView';
import { Dialog } from './ui/common/Dialog';
import type { Deck } from './domain/types';

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
  function handleImported() {
    setIncoming(null);
    setActiveTab('deck');
  }
  return (
    <AppShell header={<DeckHeader />}>
      <AppEditor activeDeck={activeDeck} activeTab={activeTab}
        onSelect={setActiveTab} onImport={openImport} />
      {incoming && <ImportDialog key={incoming.id} payload={incoming.payload}
        onClose={() => setIncoming(null)} onImported={handleImported} />}
      {importError && <Dialog open title="取り込みエラー" onClose={() => setImportError(null)}>
        <p role="alert">{importError}</p>
      </Dialog>}
    </AppShell>
  );
}

function AppEditor({ activeDeck, activeTab, onSelect, onImport }: {
  activeDeck: Deck | null; activeTab: string;
  onSelect: (id: string) => void; onImport: (payload: ImportPayload) => void;
}) {
  const emptyDeck = <>
    <EmptyState>
      <p>デッキがありません。新規デッキを作成してください。</p><NewDeckButton />
    </EmptyState>
    <ImportView onImport={onImport} />
  </>;
  const items = [
    { id: 'deck', label: 'デッキ', content: activeDeck
      ? <DeckView key={activeDeck.id} deck={activeDeck} onImport={onImport} /> : emptyDeck },
    { id: 'groups', label: 'カードグループ', content: activeDeck
      ? <GroupsView key={activeDeck.id} deck={activeDeck} />
      : <EmptyState>デッキがありません。新規デッキを作成してください。</EmptyState> },
    { id: 'patterns', label: '初動パターン', content: activeDeck
      ? <PatternsView key={activeDeck.id} deck={activeDeck} />
      : <EmptyState>デッキがありません。新規デッキを作成してください。</EmptyState> },
    { id: 'effects', label: 'ドロー効果', content: activeDeck
      ? <EffectsView key={activeDeck.id} deck={activeDeck} />
      : <EmptyState>デッキがありません。新規デッキを作成してください。</EmptyState> },
  ];
  return <Tabs activeId={activeTab} onSelect={onSelect} items={items} />;
}

function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { activeDeck } = useAppState();
  const saveStatus = useSaveStatus();
  return <ErrorBoundary activeDeck={activeDeck} saveStatus={saveStatus}>
    {children}
  </ErrorBoundary>;
}

/** 保存・カードDB・計算の接続を設定し、アプリ全体を表示する。 */
export default function App({ db, loader, createWorker, ...stateProps }:
  Omit<AppStateProviderProps, 'children'> & {
  db?: CardDb; loader?: ReturnType<typeof createCardDbLoader>; createWorker?: () => EngineWorker;
} = {}) {
  return <AppStateProvider {...stateProps}>
    <CardDbProvider db={db} loader={loader}>
      <AppErrorBoundary>
        <CalculationProvider createWorker={createWorker}><AppContent /></CalculationProvider>
      </AppErrorBoundary>
    </CardDbProvider>
  </AppStateProvider>;
}
