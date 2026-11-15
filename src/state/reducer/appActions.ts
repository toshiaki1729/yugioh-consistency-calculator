import type { Action, ActionOf, EditContext, ReducerState } from './types';
import { createEmptyDeck } from './factories';
import { applyImport, createDeck, importDeck, editActiveDeck } from './deckActions';

/** 直近の編集エラーを消す。 */
export function clearError(state: ReducerState): ReducerState {
  return { ...state, lastError: null };
}

function selectDeck(context: EditContext, action: ActionOf<'deck/select'>): void {
  context.app.activeDeckId = action.deckId;
}

function setCustomHandSize(
  context: EditContext, action: ActionOf<'settings/setCustomHandSize'>,
): void {
  context.app.settings = { customHandSize: action.handSize };
}

function importCards(context: EditContext, action: ActionOf<'import/apply'>): string | void {
  if (action.mode === 'replace') return editActiveDeck(context, action);
  const deck = createEmptyDeck(context, action.deckName);
  deck.updatedAt = context.now();
  context.app.decks.push(deck);
  context.app.activeDeckId = deck.id;
  return applyImport(deck, action, context.newId);
}

/** アプリ全体の操作と選択デッキへの操作を振り分ける。 */
export function applyAction(context: EditContext, action: Action): string | void {
  switch (action.type) {
    case 'deck/select': return selectDeck(context, action);
    case 'settings/setCustomHandSize': return setCustomHandSize(context, action);
    case 'deck/create': return createDeck(context, action);
    case 'deck/import': return importDeck(context, action);
    case 'import/apply': return importCards(context, action);
    default: return editActiveDeck(context, action);
  }
}
