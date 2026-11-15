import {
  createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import type { CardId } from '../domain/types';
import { useAppState } from '../state/store';
import { createCardDbLoader } from './loader';
import type { CardDb, CardDbState } from './loader';

type CardDbLoader = ReturnType<typeof createCardDbLoader>;
type CardDbContextValue = CardDbState & { retry: () => void };
const CardDbContext = createContext<CardDbContextValue | null>(null);

interface CardDbProviderProps {
  children: ReactNode;
  loader?: CardDbLoader;
  db?: CardDb;
}

/** カードDBの読み込み状態と再試行操作を共有する。 */
export function CardDbProvider({ children, loader, db }: CardDbProviderProps) {
  const [source] = useState<CardDbLoader>(() => {
    if (loader) return loader;
    if (!db) return createCardDbLoader();
    const ready: CardDbState = { status: 'ready', db };
    return {
      getState: () => ready, subscribe: () => () => {},
      load: async () => ready, retry: async () => ready,
    };
  });
  const hasStarted = useRef(false);
  const state = useSyncExternalStore(source.subscribe, source.getState);
  useEffect(() => {
    // StrictMode の Effect 再実行でも、同じ DB を二重に取得しない。
    if (!hasStarted.current && source.getState().status === 'loading') {
      hasStarted.current = true;
      void source.load();
    }
  }, [source]);
  const value = { ...state, retry: () => { void source.retry(); } };
  return <CardDbContext.Provider value={value}>{children}</CardDbContext.Provider>;
}

/** 共有されているカードDBの状態を取得する。 */
export function useCardDb(): CardDbContextValue {
  const value = useContext(CardDbContext);
  if (!value) throw new Error('useCardDb は CardDbProvider 内で使用してください。');
  return value;
}

/** カスタムカード、DB、ページ補助データの順で解決する。 */
export function useResolveCard() {
  const { activeDeck } = useAppState();
  const state = useCardDb();
  const db = state.status === 'ready' ? state.db : undefined;
  return useCallback((id: CardId) => activeDeck?.customCards.find(card => card.id === id)
    ?? db?.getCard(id)
    ?? (activeDeck && Object.hasOwn(activeDeck.pageData, id)
      ? activeDeck.pageData[id] : undefined), [activeDeck, db]);
}
