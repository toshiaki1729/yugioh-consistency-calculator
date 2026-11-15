import type { Deck } from '../../domain/types';
import type { Action, ActionOf, EditContext } from './types';
import { copyDeckWithNewIds, createCopyName, createEmptyDeck } from './factories';
import {
  mergeEntries, addEntry, deleteEntry, setEntryCount, setEntrySection,
} from './entryActions';
import { addCustomCard, editCustomCard, deleteCustomCard, updatePageData } from './cardActions';
import { createGroup, duplicateGroup, editGroup, deleteGroup } from './groupActions';
import {
  createPattern, duplicatePattern, editPattern, deletePattern, togglePattern, reorderPatterns,
} from './patternActions';
import { addSlot, editSlot, deleteSlot } from './slotActions';

/** デッキを新規作成し、編集対象にする。 */
export function createDeck(context: EditContext, action: ActionOf<'deck/create'>): void {
  const deck = createEmptyDeck(context, action.name);
  deck.updatedAt = context.now();
  context.app.decks.push(deck);
  context.app.activeDeckId = deck.id;
}

/** 検証対象のデッキをコピーしてアプリに追加する。 */
export function importDeck(context: EditContext, action: ActionOf<'deck/import'>): void {
  const deck = structuredClone(action.deck);
  deck.updatedAt = context.now();
  context.app.decks.push(deck);
  context.app.activeDeckId = deck.id;
}

function renameDeck(deck: Deck, action: ActionOf<'deck/rename'>): void {
  deck.name = action.name;
}

function duplicateDeck(
  context: EditContext, deck: Deck, index: number, action: ActionOf<'deck/duplicate'>,
): void {
  const copy = copyDeckWithNewIds(deck, context.newId);
  copy.name = action.name ?? createCopyName(deck.name);
  context.app.decks[index] = context.original.decks[index];
  context.app.decks.push(copy);
  context.app.activeDeckId = copy.id;
}

function deleteDeck(context: EditContext, index: number): void {
  const app = context.app;
  app.decks.splice(index, 1);
  app.activeDeckId = app.decks[Math.min(index, app.decks.length - 1)]?.id ?? null;
}

/** 取り込み内容を置き換え、カスタムカードを採番して重複エントリを合算する。 */
export function applyImport(
  deck: Deck, action: ActionOf<'import/apply'>, newId: () => string,
): string | undefined {
  deck.name = action.deckName;
  deck.entries = structuredClone(action.entries);
  deck.pageData = structuredClone(action.pageData);
  for (const item of action.customCards ?? []) {
    const card = { ...item.card, id: `c:${newId()}`, custom: true };
    deck.customCards.push(card);
    deck.entries.push({
      cardId: card.id, name: card.name, count: item.count, section: item.section,
    });
  }
  return mergeEntries(deck);
}

/** 選択中のデッキを複製し、対応する編集ハンドラに渡す。 */
export function editActiveDeck(context: EditContext, action: Action): string | void {
  const { app, newId } = context;
  const index = app.decks.findIndex(deck => deck.id === app.activeDeckId);
  if (index < 0) return '編集するデッキを選択してください。';
  const deck = structuredClone(app.decks[index]);
  app.decks[index] = deck;
  deck.updatedAt = context.now();
  switch (action.type) {
    case 'deck/rename': return renameDeck(deck, action);
    case 'deck/duplicate': return duplicateDeck(context, deck, index, action);
    case 'deck/delete': return deleteDeck(context, index);
    case 'entry/add': return addEntry(deck, action);
    case 'entry/setCount': return setEntryCount(deck, action);
    case 'entry/delete': return deleteEntry(deck, action);
    case 'entry/setSection': return setEntrySection(deck, action);
    case 'import/apply': return applyImport(deck, action, newId);
    case 'customCard/add': return addCustomCard(deck, action, newId);
    case 'customCard/edit': return editCustomCard(deck, action);
    case 'customCard/delete': return deleteCustomCard(deck, action);
    case 'pageData/update': return updatePageData(deck, action);
    case 'group/create': return createGroup(deck, action, newId);
    case 'group/duplicate': return duplicateGroup(deck, action, newId);
    case 'group/edit': return editGroup(deck, action);
    case 'group/delete': return deleteGroup(deck, action);
    case 'pattern/create': return createPattern(deck, action, newId);
    case 'pattern/duplicate': return duplicatePattern(deck, action, newId);
    case 'pattern/edit': return editPattern(deck, action);
    case 'pattern/delete': return deletePattern(deck, action);
    case 'pattern/toggle': return togglePattern(deck, action);
    case 'pattern/reorder': return reorderPatterns(deck, action);
    case 'slot/add': return addSlot(deck, action, newId);
    case 'slot/edit': return editSlot(deck, action);
    case 'slot/delete': return deleteSlot(deck, action);
  }
}
