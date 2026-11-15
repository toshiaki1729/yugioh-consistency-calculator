import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { CardId } from '../domain/types';
import { useAppState } from '../state/store';
import { createCardDbLoader } from './loader';
import type { CardDb, CardDbState } from './loader';

type CardDbLoader = ReturnType<typeof createCardDbLoader>;
type CardDbContextValue = CardDbState & { retry: () => void };
const CardDbContext = createContext<CardDbContextValue | null>(null);

export function CardDbProvider({ children, loader, db }: { children: ReactNode; loader?: CardDbLoader; db?: CardDb }) {
  const [source] = useState<CardDbLoader>(() => {
    if (loader) return loader;
    if (!db) return createCardDbLoader();
    const ready: CardDbState = { status: 'ready', db };
    return { getState: () => ready, subscribe: () => () => {}, load: async () => ready, retry: async () => ready };
  });
  const started = useRef(false);
  const state = useSyncExternalStore(source.subscribe, source.getState);
  useEffect(() => {
    // StrictMode の Effect 再実行でも、同じ DB を二重に取得しない。
    if (!started.current && source.getState().status === 'loading') {
      started.current = true;
      void source.load();
    }
  }, [source]);
  return <CardDbContext.Provider value={{ ...state, retry: () => { void source.retry(); } }}>{children}</CardDbContext.Provider>;
}

export function useCardDb(): CardDbContextValue {
  const value = useContext(CardDbContext);
  if (!value) throw new Error('useCardDb は CardDbProvider 内で使用してください。');
  return value;
}

export function useResolveCard() {
  const { activeDeck } = useAppState();
  const state = useCardDb();
  return (id: CardId) => activeDeck?.customCards.find(card => card.id === id)
    ?? (state.status === 'ready' ? state.db.getCard(id) : undefined)
    ?? activeDeck?.pageData[id];
}
