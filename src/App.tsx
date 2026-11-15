import { AppShell } from './ui/layout/AppShell';
import { Tabs } from './ui/layout/Tabs';
import { AppStateProvider, useAppState } from './state/store';
import type { AppStateProviderProps } from './state/store';
import { CardDbProvider } from './carddb/useCardDb';
import type { CardDb, createCardDbLoader } from './carddb/loader';
import { DeckHeader, NewDeckButton } from './ui/layout/DeckHeader';
import { DeckView } from './ui/deck/DeckView';
import { EmptyState } from './ui/common/EmptyState';

function AppContent() {
  const { activeDeck } = useAppState();
  return (
    <AppShell header={<DeckHeader />}>
      <Tabs
        items={[
          { id: 'deck', label: 'デッキ', content: activeDeck
            ? <DeckView key={activeDeck.id} deck={activeDeck} />
            : <EmptyState><p>デッキがありません。新規デッキを作成してください。</p><NewDeckButton /></EmptyState> },
          { id: 'groups', label: 'カードグループ' },
          { id: 'patterns', label: '初動パターン' },
        ]}
      />
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
