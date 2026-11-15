import {
  failValidation, decodeObject, readFields, createShapeDecoder, createIntegerDecoder,
  createChoiceDecoder, createArrayDecoder, decodeId, decodeBoolean,
} from './decoder';
import type { Decoder } from './decoder';
import * as limits from './limits';
import type {
  CardData, CardGroup, Deck, DeckEntry, Pattern, Result, Slot, SlotSource,
} from './types';
import { decodeTitle, decodeCardId, decodeCardName, decodeIds } from './validationFields';
import { validateCardData } from './validateCard';
import { validateFilter } from './validateFilter';

const decodeEntry: Decoder<DeckEntry> = createShapeDecoder({
  cardId: decodeCardId, name: decodeCardName,
  count: createIntegerDecoder(limits.MIN_ENTRY_COUNT, limits.MAX_ENTRY_COUNT, '枚数'),
  section: createChoiceDecoder(['main', 'extra', 'side']),
});
const decodeGroup: Decoder<CardGroup> = createShapeDecoder({
  id: decodeId, name: decodeTitle, filter: validateFilter, include: decodeIds, exclude: decodeIds,
}, true);
const decodeSource: Decoder<SlotSource> = (value, path) => {
  const record = decodeObject(value, path);
  if (!record.ok) return record;
  switch (record.value.type) {
    case 'group': return readFields({
      type: createChoiceDecoder(['group']), groupId: decodeId,
    }, record.value, path);
    case 'card': return readFields({
      type: createChoiceDecoder(['card']), cardId: decodeCardId,
    }, record.value, path);
    default: return failValidation(`${path}.type`, '対象は group / card のいずれかで指定してください');
  }
};
const decodeSlot: Decoder<Slot> = createShapeDecoder({
  id: decodeId, source: decodeSource,
  count: createIntegerDecoder(limits.MIN_SLOT_COUNT, limits.MAX_SLOT_COUNT, '必要枚数'),
  distinctNames: decodeBoolean,
});
const decodePattern: Decoder<Pattern> = createShapeDecoder({
  id: decodeId, name: decodeTitle, enabled: decodeBoolean,
  slots: createArrayDecoder(decodeSlot, limits.MAX_SLOTS),
}, true);
const decodePageData: Decoder<Record<string, CardData>> = (value, path) => {
  const record = decodeObject(value, path);
  if (!record.ok) return record;
  const entries = Object.entries(record.value);
  if (entries.length > limits.MAX_PAGE_CARDS) {
    return failValidation(path, `件数が上限（${limits.MAX_PAGE_CARDS}）を超えています`);
  }
  const cards: [string, CardData][] = [];
  for (const [key, input] of entries) {
    const id = decodeCardId(key, `${path}.${key}`);
    if (!id.ok) return id;
    if (!id.value.startsWith('k')) {
      return failValidation(`${path}.${key}`, '公式カードの補助データの ID は k と数字で指定してください');
    }
    const card = validateCardData(input, `${path}.${key}`);
    if (!card.ok) return card;
    if (key !== card.value.id) return failValidation(`${path}.${key}`, 'キーとカードの ID が一致していません');
    if (card.value.custom === true) {
      return failValidation(`${path}.${key}.custom`, '公式カードの補助データは custom を true にしないでください');
    }
    cards.push([key, card.value]);
  }
  return { ok: true, value: Object.fromEntries(cards) };
};
const decodeCustomCard: Decoder<CardData> = (value, path) => {
  const card = validateCardData(value, path);
  if (!card.ok) return card;
  if (!card.value.id.startsWith('c:')) {
    return failValidation(`${path}.id`, 'カスタムカードの ID は c: で始めてください');
  }
  if (card.value.custom !== true) {
    return failValidation(`${path}.custom`, 'カスタムカードは custom を true にしてください');
  }
  return card;
};
const decodeTimestamp: Decoder<number> = (value, path) => {
  const isValid = typeof value === 'number' && Number.isFinite(value)
    && value >= limits.MIN_TIMESTAMP;
  return isValid
    ? { ok: true, value } : failValidation(path, '更新日時は 0 以上の有限の数値で指定してください');
};
const decodeDeckData: Decoder<Deck> = createShapeDecoder({
  id: decodeId, name: decodeTitle,
  entries: createArrayDecoder(decodeEntry, limits.MAX_ENTRIES),
  groups: createArrayDecoder(decodeGroup, limits.MAX_GROUPS),
  patterns: createArrayDecoder(decodePattern, limits.MAX_PATTERNS),
  customCards: createArrayDecoder(decodeCustomCard, limits.MAX_CUSTOM_CARDS),
  pageData: decodePageData, updatedAt: decodeTimestamp,
}, true);

/** 同じ種類の編集対象で ID が重複していないか検証する。 */
export function validateUniqueIds(items: { id: string }[], path: string): Result<Set<string>> {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) return failValidation(path, `ID『${item.id}』が重複しています`);
    seen.add(item.id);
  }
  return { ok: true, value: seen };
}

/** デッキの項目と参照整合性を検証し、復元時の削除件数も返す。 */
export function readDeck(
  value: unknown, path: string, shouldDropDanglingSlots: boolean,
): Result<{ deck: Deck; droppedSlots: number }> {
  const parsed = decodeDeckData(value, path);
  if (!parsed.ok) return parsed;
  const deck = parsed.value;
  const location = `${path}『${deck.name}』`;
  const groups = validateUniqueIds(deck.groups, `${location}のグループ`);
  if (!groups.ok) return groups;
  for (const [label, items] of [
    ['パターン', deck.patterns], ['スロット', deck.patterns.flatMap(item => item.slots)],
    ['カスタムカード', deck.customCards],
  ] as const) {
    const unique = validateUniqueIds(items, `${location}の${label}`);
    if (!unique.ok) return unique;
  }
  const entries = new Set<string>();
  for (let i = 0; i < deck.entries.length; i++) {
    const item = deck.entries[i];
    const key = JSON.stringify([item.section, item.cardId]);
    if (entries.has(key)) return failValidation(`${location}のエントリ ${i + 1}`, '同じ区分のカードが重複しています');
    entries.add(key);
  }
  let droppedSlots = 0;
  for (const item of deck.patterns) {
    const checked = checkSlotReferences(item, groups.value, location, shouldDropDanglingSlots);
    if (!checked.ok) return checked;
    droppedSlots += checked.value;
  }
  return { ok: true, value: { deck, droppedSlots } };
}

function checkSlotReferences(
  pattern: Pattern, groupIds: Set<string>, location: string, shouldDropDanglingSlots: boolean,
): Result<number> {
  const slots: Slot[] = [];
  let droppedSlots = 0;
  for (const candidate of pattern.slots) {
    if (candidate.source.type !== 'group' || groupIds.has(candidate.source.groupId)) {
      slots.push(candidate);
      continue;
    }
    if (!shouldDropDanglingSlots) return failValidation(
      `${location}のパターン『${pattern.name}』のスロット『${candidate.id}』`,
      `参照先のグループ『${candidate.source.groupId}』がありません`,
    );
    droppedSlots++;
  }
  pattern.slots = slots;
  return { ok: true, value: droppedSlots };
}

