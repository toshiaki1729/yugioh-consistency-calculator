import type {
  AppState, CardData, CardGroup, CardId, Deck, DeckEntry, Pattern, Section, Slot,
} from '../../domain/types';

/** 状態更新に使う ID 発行と時計の差し替え先。 */
export interface StateDependencies {
  newId?: () => string;
  now?: () => number;
}

/** 保存対象のアプリ状態と直近の編集エラー。 */
export interface ReducerState {
  app: AppState;
  lastError: string | null;
}

/** デッキ選択以外の編集は、現在選択しているデッキに適用する。 */
export type Action =
  | { type: 'error/clear' }
  | { type: 'deck/create'; name?: string }
  | { type: 'deck/rename'; name: string }
  | { type: 'deck/duplicate'; name?: string }
  | { type: 'deck/delete' }
  | { type: 'deck/select'; deckId: string | null }
  | { type: 'deck/import'; deck: Deck }
  | { type: 'entry/add'; cardId: CardId; name: string; section: Section; count?: number }
  | { type: 'entry/setCount'; cardId: CardId; section: Section; count: number }
  | { type: 'entry/delete'; cardId: CardId; section: Section }
  | { type: 'entry/setSection'; cardId: CardId; section: Section; newSection: Section }
  | { type: 'import/apply'; mode: 'new' | 'replace'; deckName: string;
      entries: DeckEntry[]; pageData: Record<CardId, CardData>;
      customCards?: { card: Omit<CardData, 'id' | 'custom'>; count: number; section: Section }[] }
  | { type: 'customCard/add'; card: Omit<CardData, 'id' | 'custom'>;
      addToDeck?: { section: Section; count: number } }
  | { type: 'customCard/edit'; cardId: CardId; changes: Partial<Omit<CardData, 'id' | 'custom'>> }
  | { type: 'customCard/delete'; cardId: CardId }
  | { type: 'pageData/update'; pageData: Record<CardId, CardData> }
  | { type: 'group/create'; name?: string }
  | { type: 'group/duplicate'; groupId: string }
  | { type: 'group/edit'; groupId: string; changes: Partial<Omit<CardGroup, 'id'>> }
  | { type: 'group/delete'; groupId: string }
  | { type: 'pattern/create'; name?: string }
  | { type: 'pattern/duplicate'; patternId: string }
  | { type: 'pattern/edit'; patternId: string; changes: Partial<Pick<Pattern, 'name' | 'enabled'>> }
  | { type: 'pattern/delete'; patternId: string }
  | { type: 'pattern/toggle'; patternId: string }
  | { type: 'pattern/reorder'; patternIds: string[] }
  | { type: 'slot/add'; patternId: string; slot: Omit<Slot, 'id'> }
  | { type: 'slot/edit'; patternId: string; slotId: string; changes: Partial<Omit<Slot, 'id'>> }
  | { type: 'slot/delete'; patternId: string; slotId: string }
  | { type: 'settings/setCustomHandSize'; handSize: number | null };

/** アクションの種類に対応する入力。 */
export type ActionOf<Type extends Action['type']> = Extract<Action, { type: Type }>;

/** 反映前のアプリ状態と更新時の依存先。 */
export interface EditContext {
  app: AppState;
  original: AppState;
  newId: () => string;
  now: () => number;
}
