import { validateAppState } from '../domain/validate';
import { applyAction, clearError } from './reducer/appActions';
import type { Action, ReducerState, StateDependencies } from './reducer/types';

export type { Action, ReducerState, StateDependencies } from './reducer/types';
export { createEmptyDeck, createInitialState, copyDeckWithNewIds } from './reducer/factories';

/** 編集を一度だけ検証し、失敗した更新を反映しない reducer を作る。 */
export function createReducer(
  { newId = () => crypto.randomUUID(), now = Date.now }: StateDependencies = {},
) {
  return (state: ReducerState, action: Action): ReducerState => {
    if (action.type === 'error/clear') return clearError(state);
    const app = { ...state.app, decks: [...state.app.decks] };
    const error = applyAction({ app, original: state.app, newId, now }, action);
    if (error !== undefined) return { ...state, lastError: error };
    const checked = validateAppState(app);
    return checked.ok
      ? { app: checked.value.state, lastError: null } : { ...state, lastError: checked.error };
  };
}
