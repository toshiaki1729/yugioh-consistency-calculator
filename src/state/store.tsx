import {
  createContext, useContext, useEffect, useReducer, useState, useSyncExternalStore,
} from 'react';
import type { Dispatch, ReactNode } from 'react';
import type { AppState, Deck } from '../domain/types';
import { createReducer } from './reducer';
import type { Action, StateDependencies } from './reducer';
import { createSaver, loadState } from './persist';
import type { SaveStatus, StateStorage } from './persist';

const AppContext = createContext<{ app: AppState; activeDeck: Deck | null } | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);
const SaveContext = createContext<SaveStatus | null>(null);
interface StateNotice {
  notice: string | null;
  lastError: string | null;
  saveError: string | null;
}

const NoticeContext = createContext<StateNotice | null>(null);

/** 保存先と ID・時計を差し替えられるプロバイダー設定。 */
export interface AppStateProviderProps extends StateDependencies {
  children: ReactNode;
  storage?: StateStorage;
}

/** アプリ状態・操作・保存状況を子コンポーネントに提供する。 */
export function AppStateProvider({ children, storage, newId, now }: AppStateProviderProps) {
  const [session] = useState(() => {
    // localStorage 自体へのアクセス拒否も、読み書き境界で保存エラーとして扱う。
    const backend = storage ?? {
      getItem: (key: string) => window.localStorage.getItem(key),
      setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
    };
    const loaded = loadState(backend, { newId, now });
    const saver = createSaver(backend, { saveBlocked: loaded.saveBlocked });
    return { ...loaded, reducer: createReducer({ newId, now }), saver };
  });
  const [state, dispatch] = useReducer(session.reducer, { app: session.state, lastError: null });
  const status = useSyncExternalStore(session.saver.subscribe, session.saver.getStatus);
  const saveError = useSyncExternalStore(session.saver.subscribe, session.saver.getError);

  useEffect(() => { session.saver.schedule(state.app); }, [session, state.app]);
  useEffect(() => {
    const flush = () => session.saver.flush();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flush();
    };
  }, [session]);

  const activeDeck = state.app.decks.find(deck => deck.id === state.app.activeDeckId) ?? null;
  const notice = { notice: session.notice, lastError: state.lastError, saveError };
  return (
    <AppContext.Provider value={{ app: state.app, activeDeck }}>
      <DispatchContext.Provider value={dispatch}>
        <SaveContext.Provider value={status}>
          <NoticeContext.Provider value={notice}>
            {children}
          </NoticeContext.Provider>
        </SaveContext.Provider>
      </DispatchContext.Provider>
    </AppContext.Provider>
  );
}

/** アプリ状態と選択中のデッキを取得する。 */
export function useAppState(): { app: AppState; activeDeck: Deck | null } {
  const value = useContext(AppContext);
  if (!value) throw new Error('useAppState は AppStateProvider 内で使用してください。');
  return value;
}

/** 状態を編集する dispatch を取得する。 */
export function useDispatch(): Dispatch<Action> {
  const value = useContext(DispatchContext);
  if (!value) throw new Error('useDispatch は AppStateProvider 内で使用してください。');
  return value;
}

/** 自動保存の状態を取得する。 */
export function useSaveStatus(): SaveStatus {
  const value = useContext(SaveContext);
  if (value === null) throw new Error('useSaveStatus は AppStateProvider 内で使用してください。');
  return value;
}

/** 復元時の通知と編集・保存エラーを取得する。 */
export function useStateNotice(): StateNotice {
  const value = useContext(NoticeContext);
  if (!value) throw new Error('useStateNotice は AppStateProvider 内で使用してください。');
  return value;
}
