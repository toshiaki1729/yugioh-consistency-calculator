import { useMemo } from 'react';
import { useCardDb, useResolveCard } from '../../carddb/useCardDb';
import { evaluateFilter, isInGroup } from '../../domain/filter';
import type { CardData, CardGroup, Deck, DeckEntry } from '../../domain/types';

/** グループ一覧で表示するデッキのエントリと取得済みカード。 */
export interface GroupRow { entry: DeckEntry; card?: CardData }

const kindOrder = { monster: 0, spell: 1, trap: 2 };
const UNKNOWN_KIND_ORDER = 3;

function collectGroupRows(group: CardGroup, main: GroupRow[]) {
  const members = main.filter(({ entry, card }) => isInGroup(group, entry.cardId, card));
  const evaluated = main.map(row => ({
    ...row,
    hasMatch: row.card ? evaluateFilter(group.filter, row.card) : false,
    isIncluded: group.include.includes(row.entry.cardId),
    isExcluded: group.exclude.includes(row.entry.cardId),
  }));
  return {
    group, kinds: members.length, count: members.reduce((sum, row) => sum + row.entry.count, 0),
    rows: evaluated.filter(row => row.card && (row.hasMatch || row.isIncluded || row.isExcluded)),
    available: evaluated.filter(row => !row.hasMatch && !row.isIncluded && !row.isExcluded),
    unknownOverrides: evaluated.filter(row => !row.card && (row.isIncluded || row.isExcluded)),
  };
}

/** デッキと DB の変更に合わせて所属集計と手動設定の候補を求める。 */
export function useGroupRows(deck: Deck) {
  const resolveCard = useResolveCard();
  const databaseState = useCardDb();
  const database = databaseState.status === 'ready' ? databaseState.db : undefined;
  return useMemo(() => {
    const main = deck.entries.filter(entry => entry.section === 'main')
      .map(entry => ({ entry, card: resolveCard(entry.cardId) }))
      .sort((left, right) => {
        const leftOrder = left.card ? kindOrder[left.card.kind] : UNKNOWN_KIND_ORDER;
        const rightOrder = right.card ? kindOrder[right.card.kind] : UNKNOWN_KIND_ORDER;
        return leftOrder - rightOrder
          || (left.card?.name ?? left.entry.name)
            .localeCompare(right.card?.name ?? right.entry.name, 'ja');
      });
    const unknown = main.filter(row => !row.card);
    const deckCards = main.map(({ entry, card }) => ({
      id: entry.cardId, name: card?.name ?? entry.name, card,
    }));
    return {
      deckCards,
      unknownCount: unknown.length,
      unknownCopies: unknown.reduce((sum, row) => sum + row.entry.count, 0),
      groups: deck.groups.map(group => collectGroupRows(group, main)),
    };
    // resolveCard は毎描画で新しい関数になるため、参照するデッキと DB の変更で再計算する。
  }, [deck, databaseState.status, database]);
}
