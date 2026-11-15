import { normalizeForMatch } from '../domain/normalize';
import type { CardData, CardId } from '../domain/types';
import type { CardDbFile } from './convert';
import { searchCards } from './search';
import type { CardSearchEntry } from './search';

/** カードのID検索・名前検索を提供する索引。 */
export interface CardDb {
  generatedAt: string;
  size: number;
  getCard(id: CardId): CardData | undefined;
  findByExactName(name: string): CardData[];
  search(query: string, limit?: number): CardData[];
}

/** カードDBの読み込み状態。 */
export type CardDbState =
  | { status: 'loading' }
  | { status: 'ready'; db: CardDb }
  | { status: 'error'; error: string };

/** 変換済みカードDBから検索用の索引を作る。 */
export function createCardDb(file: CardDbFile): CardDb {
  const byId = new Map<CardId, CardData>();
  const byName = new Map<string, CardData[]>();
  const index: CardSearchEntry[] = [];
  for (const card of file.cards) {
    const name = normalizeForMatch(card.name);
    byId.set(card.id, card);
    const matches = byName.get(name);
    if (matches) matches.push(card);
    else byName.set(name, [card]);
    index.push({ card, name, kana: normalizeForMatch(card.kana ?? '') });
  }
  return {
    generatedAt: file.generatedAt,
    size: byId.size,
    getCard: (id) => byId.get(id),
    findByExactName: (name) => byName.get(normalizeForMatch(name))?.slice() ?? [],
    search: (query, limit) => searchCards(index, query, limit),
  };
}

/** カードDBの非同期取得と状態通知・再試行を提供する。 */
export function createCardDbLoader(
  fetchImpl: typeof fetch = fetch,
  url = import.meta.env.BASE_URL + 'data/cards.ja.json',
) {
  let state: CardDbState = { status: 'loading' };
  const listeners = new Set<(state: CardDbState) => void>();
  const publish = (next: CardDbState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };
  const load = async (): Promise<CardDbState> => {
    publish({ status: 'loading' });
    let next: CardDbState;
    try {
      const response = await fetchImpl(url);
      if (!response.ok) {
        next = { status: 'error', error: `カードDBを読み込めませんでした（HTTP ${response.status}）` };
      } else {
        const file: unknown = await response.json();
        next = readCardDbFile(file);
      }
    } catch {
      next = { status: 'error', error: 'カードDBの取得または JSON の読み込みに失敗しました。再試行してください' };
    }
    publish(next);
    return next;
  };
  return {
    getState: () => state,
    subscribe(listener: (state: CardDbState) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    load,
    retry: load,
  };
}

function readCardDbFile(file: unknown): CardDbState {
  if (!file || typeof file !== 'object' || !('version' in file) || file.version !== 1
    || !('cards' in file) || !Array.isArray(file.cards)
    || !('generatedAt' in file) || typeof file.generatedAt !== 'string') {
    return { status: 'error', error: 'カードDBの形式が不正です（version・cards・generatedAt）' };
  }
  const invalidIndex = file.cards.findIndex((card: unknown) =>
    !card || typeof card !== 'object'
    || !('id' in card) || typeof card.id !== 'string'
    || !('name' in card) || typeof card.name !== 'string'
    || !('kind' in card) || !['monster', 'spell', 'trap'].includes(card.kind as string)
    || ('kana' in card && card.kana !== undefined && typeof card.kana !== 'string'));
  if (invalidIndex >= 0) {
    return { status: 'error', error: `カードDBの ${invalidIndex + 1} 件目のカードが不正です` };
  }
  return { status: 'ready', db: createCardDb({
    version: 1, source: 'yaml-yugi', generatedAt: file.generatedAt,
    cards: file.cards as CardData[],
  }) };
}
