import {
  failValidation, createShapeDecoder, createIntegerDecoder, createChoiceDecoder, allowNull,
  createArrayDecoder, decodeId,
} from './decoder';
import * as limits from './limits';
import type { AppState, Deck, Result } from './types';
import { readDeck, validateUniqueIds } from './validateDeck';
import type { DroppedReferences } from './validateReferences';
export { validateCardData } from './validateCard';
export { validateFilter } from './validateFilter';

/** デッキ全体を検証し、参照切れもエラーとして返す。 */
export function validateDeck(value: unknown, path = 'デッキ'): Result<Deck> {
  const parsed = readDeck(value, path, false);
  return parsed.ok ? { ok: true, value: parsed.value.deck } : parsed;
}

/** 保存状態を検証し、指定時だけ参照切れのスロット・条件・効果を取り除く。 */
export function validateAppState(
  value: unknown, options: { dropDanglingSlots?: boolean } = {},
): Result<{ state: AppState } & DroppedReferences> {
  let droppedSlots = 0;
  let droppedConditions = 0;
  let droppedEffects = 0;
  const parsed = createShapeDecoder({
    schemaVersion: createChoiceDecoder([limits.APP_SCHEMA_VERSION] as const),
    decks: createArrayDecoder((input, path) => {
      const deck = readDeck(input, path, options.dropDanglingSlots === true);
      if (!deck.ok) return deck;
      droppedSlots += deck.value.droppedSlots;
      droppedConditions += deck.value.droppedConditions;
      droppedEffects += deck.value.droppedEffects;
      return { ok: true, value: deck.value.deck };
    }, limits.MAX_DECKS),
    activeDeckId: allowNull(decodeId),
    settings: createShapeDecoder({
      customHandSize: allowNull(createIntegerDecoder(
        limits.MIN_HAND_SIZE, limits.MAX_HAND_SIZE, '手札枚数',
      )),
    }),
  })(value, 'アプリ状態');
  if (!parsed.ok) return parsed;
  const state = parsed.value;
  const unique = validateUniqueIds(state.decks, 'アプリ状態のデッキ');
  if (!unique.ok) return unique;
  if (state.activeDeckId !== null && !unique.value.has(state.activeDeckId)) {
    return failValidation('アプリ状態.activeDeckId', '選択中のデッキがありません');
  }
  return { ok: true, value: { state, droppedSlots, droppedConditions, droppedEffects } };
}
