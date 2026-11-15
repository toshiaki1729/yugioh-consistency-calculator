import type {
  AppState, CardData, CardGroup, CardId, Deck, DeckEntry, FilterNode, Pattern, Section, Slot,
} from '../domain/types';
import { validateAppState } from '../domain/validate';

export interface StateDependencies {
  newId?: () => string;
  now?: () => number;
}

export interface ReducerState {
  app: AppState;
  lastError: string | null;
}

// デッキ選択以外の編集は、現在選択しているデッキに適用する。
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
  | { type: 'import/apply'; mode: 'new' | 'replace'; deckName: string; entries: DeckEntry[]; pageData: Record<CardId, CardData>;
      customCards?: { card: Omit<CardData, 'id' | 'custom'>; count: number; section: Section }[] }
  | { type: 'customCard/add'; card: Omit<CardData, 'id' | 'custom'> }
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

export function createEmptyDeck(
  { newId = () => crypto.randomUUID(), now = Date.now }: StateDependencies = {},
  name = '新しいデッキ',
): Deck {
  return { id: newId(), name, entries: [], groups: [], patterns: [], customCards: [], pageData: {}, updatedAt: now() };
}

export function createInitialState(dependencies: StateDependencies = {}): AppState {
  const deck = createEmptyDeck(dependencies);
  return { schemaVersion: 1, decks: [deck], activeDeckId: deck.id, settings: { customHandSize: null } };
}

// カード ID は参照の意味を保ち、デッキ内の編集対象の ID だけ振り直す。
export function copyDeckWithNewIds(deck: Deck, newId: () => string): Deck {
  const copy = structuredClone(deck);
  copy.id = newId();
  const groupIds = new Map<string, string>();
  for (const group of copy.groups) {
    const id = newId();
    groupIds.set(group.id, id);
    group.id = id;
  }
  for (const pattern of copy.patterns) {
    pattern.id = newId();
    for (const slot of pattern.slots) {
      slot.id = newId();
      if (slot.source.type === 'group') slot.source.groupId = groupIds.get(slot.source.groupId)!;
    }
  }
  return copy;
}

export function createReducer(
  { newId = () => crypto.randomUUID(), now = Date.now }: StateDependencies = {},
) {
  return (state: ReducerState, action: Action): ReducerState => {
    if (action.type === 'error/clear') return { ...state, lastError: null };
    const app: AppState = { ...state.app, decks: [...state.app.decks] };
    const index = app.decks.findIndex(deck => deck.id === app.activeDeckId);

    if (action.type === 'deck/select') {
      app.activeDeckId = action.deckId;
    } else if (action.type === 'settings/setCustomHandSize') {
      app.settings = { customHandSize: action.handSize };
    } else if (action.type === 'deck/create' || action.type === 'deck/import'
      || (action.type === 'import/apply' && action.mode === 'new')) {
      const deck = action.type === 'deck/import'
        ? structuredClone(action.deck)
        : createEmptyDeck({ newId, now }, action.type === 'deck/create' ? action.name : action.deckName);
      if (action.type === 'import/apply') {
        deck.entries = structuredClone(action.entries);
        deck.pageData = structuredClone(action.pageData);
      }
      deck.updatedAt = now();
      app.decks.push(deck);
      app.activeDeckId = deck.id;
    } else {
      if (index < 0) return { ...state, lastError: '編集するデッキを選択してください。' };
      const deck = structuredClone(app.decks[index]);
      app.decks[index] = deck;
      deck.updatedAt = now();
      switch (action.type) {
        case 'deck/rename': deck.name = action.name; break;
        case 'deck/duplicate': {
          const copy = copyDeckWithNewIds(deck, newId);
          copy.name = action.name ?? `${deck.name.slice(0, 46)}のコピー`;
          app.decks[index] = state.app.decks[index];
          app.decks.push(copy);
          app.activeDeckId = copy.id;
          break;
        }
        case 'deck/delete':
          app.decks.splice(index, 1);
          app.activeDeckId = app.decks[Math.min(index, app.decks.length - 1)]?.id ?? null;
          break;
        case 'entry/add':
          deck.entries.push({ cardId: action.cardId, name: action.name, section: action.section, count: action.count ?? 1 });
          break;
        case 'entry/setCount':
        case 'entry/delete': {
          const entry = deck.entries.find(item => item.cardId === action.cardId && item.section === action.section);
          if (!entry) return { ...state, lastError: '対象のカードがデッキにありません。' };
          if (action.type === 'entry/delete' || action.count === 0) deck.entries = deck.entries.filter(item => item !== entry);
          else entry.count = action.count;
          break;
        }
        case 'entry/setSection': {
          const entry = deck.entries.find(item => item.cardId === action.cardId && item.section === action.section);
          if (!entry) return { ...state, lastError: '対象のカードがデッキにありません。' };
          entry.section = action.newSection;
          break;
        }
        case 'import/apply':
          deck.name = action.deckName;
          deck.entries = structuredClone(action.entries);
          deck.pageData = structuredClone(action.pageData);
          break;
        case 'customCard/add':
          deck.customCards.push({ ...action.card, id: `c:${newId()}`, custom: true });
          break;
        case 'customCard/edit': {
          const card = deck.customCards.find(item => item.id === action.cardId);
          if (!card) return { ...state, lastError: '対象のカスタムカードがありません。' };
          Object.assign(card, action.changes);
          for (const entry of deck.entries) if (entry.cardId === card.id) entry.name = card.name;
          break;
        }
        case 'customCard/delete': {
          const cardId = action.cardId;
          if (!deck.customCards.some(card => card.id === action.cardId)) {
            return { ...state, lastError: '対象のカスタムカードがありません。' };
          }
          deck.customCards = deck.customCards.filter(card => card.id !== action.cardId);
          deck.entries = deck.entries.filter(entry => entry.cardId !== action.cardId);
          function removeCard(node: FilterNode): void {
            if (node.op === 'pred') {
              if (node.pred.kind === 'cards') node.pred.cardIds = node.pred.cardIds.filter(id => id !== cardId);
            } else if (node.op === 'not') removeCard(node.child);
            else node.children.forEach(removeCard);
          }
          for (const group of deck.groups) {
            group.include = group.include.filter(id => id !== action.cardId);
            group.exclude = group.exclude.filter(id => id !== action.cardId);
            removeCard(group.filter);
          }
          for (const pattern of deck.patterns) {
            pattern.slots = pattern.slots.filter(slot => slot.source.type !== 'card' || slot.source.cardId !== action.cardId);
          }
          break;
        }
        case 'pageData/update': deck.pageData = { ...deck.pageData, ...action.pageData }; break;
        case 'group/create':
          deck.groups.push({ id: newId(), name: action.name ?? '新しいグループ', filter: { op: 'and', children: [] }, include: [], exclude: [] });
          break;
        case 'group/duplicate': {
          const group = deck.groups.find(item => item.id === action.groupId);
          if (!group) return { ...state, lastError: '対象のグループがありません。' };
          deck.groups.push({ ...structuredClone(group), id: newId(), name: `${group.name.slice(0, 46)}のコピー` });
          break;
        }
        case 'group/edit': {
          const group = deck.groups.find(item => item.id === action.groupId);
          if (!group) return { ...state, lastError: '対象のグループがありません。' };
          Object.assign(group, action.changes);
          break;
        }
        case 'group/delete':
          deck.groups = deck.groups.filter(group => group.id !== action.groupId);
          for (const pattern of deck.patterns) {
            pattern.slots = pattern.slots.filter(slot => slot.source.type !== 'group' || slot.source.groupId !== action.groupId);
          }
          break;
        case 'pattern/create':
          deck.patterns.push({ id: newId(), name: action.name ?? '新しいパターン', enabled: true, slots: [] });
          break;
        case 'pattern/duplicate': {
          const pattern = deck.patterns.find(item => item.id === action.patternId);
          if (!pattern) return { ...state, lastError: '対象のパターンがありません。' };
          deck.patterns.push({ ...structuredClone(pattern), id: newId(), name: `${pattern.name.slice(0, 46)}のコピー`,
            slots: pattern.slots.map(slot => ({ ...structuredClone(slot), id: newId() })) });
          break;
        }
        case 'pattern/delete': deck.patterns = deck.patterns.filter(pattern => pattern.id !== action.patternId); break;
        case 'pattern/reorder': {
          const patterns = new Map(deck.patterns.map(pattern => [pattern.id, pattern]));
          if (action.patternIds.length !== patterns.size || new Set(action.patternIds).size !== patterns.size
            || action.patternIds.some(id => !patterns.has(id))) {
            return { ...state, lastError: '並べ替えには、すべてのパターン ID を重複なく指定してください。' };
          }
          deck.patterns = action.patternIds.map(id => patterns.get(id)!);
          break;
        }
        case 'pattern/edit': case 'pattern/toggle': case 'slot/add': case 'slot/edit': case 'slot/delete': {
          const pattern = deck.patterns.find(item => item.id === action.patternId);
          if (!pattern) return { ...state, lastError: '対象のパターンがありません。' };
          if (action.type === 'pattern/edit') Object.assign(pattern, action.changes);
          else if (action.type === 'pattern/toggle') pattern.enabled = !pattern.enabled;
          else if (action.type === 'slot/add') pattern.slots.push({ ...action.slot, id: newId() });
          else {
            const slot = pattern.slots.find(item => item.id === action.slotId);
            if (!slot) return { ...state, lastError: '対象のスロットがありません。' };
            if (action.type === 'slot/edit') Object.assign(slot, action.changes);
            else pattern.slots = pattern.slots.filter(item => item !== slot);
          }
          break;
        }
      }
    }

    if (action.type === 'entry/add' || action.type === 'entry/setSection' || action.type === 'import/apply') {
      const deck = app.decks.find(item => item.id === app.activeDeckId)!;
      if (action.type === 'import/apply') {
        for (const item of action.customCards ?? []) {
          const card = { ...item.card, id: `c:${newId()}`, custom: true };
          deck.customCards.push(card);
          deck.entries.push({ cardId: card.id, name: card.name, count: item.count, section: item.section });
        }
      }
      const merged = new Map<string, DeckEntry>();
      for (const entry of deck.entries) {
        if (!Number.isInteger(entry.count) || entry.count < 1 || entry.count > 60) {
          return { ...state, lastError: `デッキ「${deck.name}」のカード「${entry.name}」: 枚数は 1〜60 の整数で指定してください。` };
        }
        const key = JSON.stringify([entry.cardId, entry.section]);
        const existing = merged.get(key);
        if (existing) existing.count += entry.count;
        else merged.set(key, { ...entry });
      }
      deck.entries = [...merged.values()];
    }
    // 編集境界で T02 の規則を適用し、失敗した更新は一切反映しない。
    const checked = validateAppState(app);
    return checked.ok ? { app: checked.value.state, lastError: null } : { ...state, lastError: checked.error };
  };
}
