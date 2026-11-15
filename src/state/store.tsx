import { createContext, useContext, useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import type { Dispatch, ReactNode } from 'react';
import type { AppState, Deck } from '../domain/types';
import { createReducer } from './reducer';
import type { Action, StateDependencies } from './reducer';
import { createSaver, loadState } from './persist';
import type { SaveStatus, StateStorage } from './persist';

const AppContext = createContext<{ app: AppState; activeDeck: Deck | null } | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);
const SaveContext = createContext<SaveStatus | null>(null);
const NoticeContext = createContext<{ notice: string | null; lastError: string | null; saveError: string | null } | null>(null);

export interface AppStateProviderProps extends StateDependencies {
  children: ReactNode;
  storage?: StateStorage;
}

export function AppStateProvider({ children, storage, newId, now }: AppStateProviderProps) {
  const [session] = useState(() => {
    // localStorage 自体へのアクセス拒否も、読み書き境界で保存エラーとして扱う。
    const backend = storage ?? {
      getItem: (key: string) => window.localStorage.getItem(key),
      setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
    };
    const loaded = loadState(backend, { newId, now });
    return { ...loaded, reducer: createReducer({ newId, now }), saver: createSaver(backend, { saveBlocked: loaded.saveBlocked }) };
  });
  const [state, dispatch] = useReducer(session.reducer, { app: session.state, lastError: null });
  const status = useSyncExternalStore(session.saver.subscribe, session.saver.getStatus);
  const saveError = useSyncExternalStore(session.saver.subscribe, session.saver.getError);

  useEffect(() => { session.saver.schedule(state.app); }, [session, state.app]);
  useEffect(() => () => { session.saver.flush(); }, [session]);

  return (
    <AppContext.Provider value={{ app: state.app, activeDeck: state.app.decks.find(deck => deck.id === state.app.activeDeckId) ?? null }}>
      <DispatchContext.Provider value={dispatch}>
        <SaveContext.Provider value={status}>
          <NoticeContext.Provider value={{ notice: session.notice, lastError: state.lastError, saveError }}>
            {children}
          </NoticeContext.Provider>
        </SaveContext.Provider>
      </DispatchContext.Provider>
    </AppContext.Provider>
  );
}

export function useAppState(): { app: AppState; activeDeck: Deck | null } {
  const value = useContext(AppContext);
  if (!value) throw new Error('useAppState は AppStateProvider 内で使用してください。');
  return value;
}

export function useDispatch(): Dispatch<Action> {
  const value = useContext(DispatchContext);
  if (!value) throw new Error('useDispatch は AppStateProvider 内で使用してください。');
  return value;
}

export function useSaveStatus(): SaveStatus {
  const value = useContext(SaveContext);
  if (value === null) throw new Error('useSaveStatus は AppStateProvider 内で使用してください。');
  return value;
}

export function useStateNotice(): { notice: string | null; lastError: string | null; saveError: string | null } {
  const value = useContext(NoticeContext);
  if (!value) throw new Error('useStateNotice は AppStateProvider 内で使用してください。');
  return value;
}
