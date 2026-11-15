import { attributeLabels, cardKindLabels, monsterTypeLabels, spellTrapPropertyLabels } from './labels';
import type {
  AppState, CardData, CardGroup, Deck, DeckEntry, FilterNode, NumRange, Pattern, Predicate,
  Result, Slot, SlotSource,
} from './types';

type Decoder<T> = (value: unknown, path: string) => Result<T>;
type Decoded<S> = { [K in keyof S]: S[K] extends Decoder<infer T> ? T : never };

function failure(path: string, reason: string): Result<never> {
  return { ok: false, error: `${path}: ${reason}` };
}

const object: Decoder<Record<string, unknown>> = (value, path) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ok: true, value: value as Record<string, unknown> }
    : failure(path, 'オブジェクトで指定してください');

function readFields<S extends Record<string, Decoder<unknown>>>(
  fields: S, record: Record<string, unknown>, path: string,
): Result<Decoded<S>> {
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    const field = fields[key](record[key], `${path}.${key}`);
    if (!field.ok) return field;
    if (field.value !== undefined) output[key] = field.value;
  }
  return { ok: true, value: output as Decoded<S> };
}

function shape<S extends Record<string, Decoder<unknown>>>(
  fields: S, named = false,
): Decoder<Decoded<S>> {
  return (value, path) => {
    const record = object(value, path);
    if (!record.ok) return record;
    if (named && typeof record.value.name === 'string') path += `『${record.value.name}』`;
    return readFields(fields, record.value, path);
  };
}

function string(min: number, max: number, label: string): Decoder<string> {
  return (value, path) => typeof value === 'string' && value.length >= min && value.length <= max
    ? { ok: true, value }
    : failure(path, `${label}は ${min}〜${max} 文字で指定してください`);
}

const id: Decoder<string> = (value, path) => typeof value === 'string' && value.length > 0
  ? { ok: true, value } : failure(path, 'ID は空でない文字列で指定してください');
const title = string(1, 50, '名前');
const cardName = string(1, 100, 'カード名');
const keyword = string(1, 100, 'キーワード');
const cardText = string(0, 5000, 'カードテキスト');
const boolean: Decoder<boolean> = (value, path) => typeof value === 'boolean'
  ? { ok: true, value } : failure(path, '真偽値で指定してください');

function integer(min: number, max: number, label: string): Decoder<number> {
  return (value, path) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? { ok: true, value } : failure(path, `${label}は ${min}〜${max} の整数で指定してください`);
}

function choice<const T extends string | number>(values: readonly T[]): Decoder<T> {
  return (value, path) => values.some(item => item === value)
    ? { ok: true, value: value as T } : failure(path, `値は ${values.join(' / ')} のいずれかで指定してください`);
}

function enumKey<T extends string>(labels: Record<T, string>): Decoder<T> {
  return choice(Object.keys(labels) as T[]);
}

function optional<T>(decode: Decoder<T>): Decoder<T | undefined> {
  return (value, path) => value === undefined ? { ok: true, value } : decode(value, path);
}

function nullable<T>(decode: Decoder<T>): Decoder<T | null> {
  return (value, path) => value === null ? { ok: true, value } : decode(value, path);
}

function array<T>(decode: Decoder<T>, max = Infinity): Decoder<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) return failure(path, '配列で指定してください');
    if (value.length > max) return failure(path, `件数が上限（${max}）を超えています`);
    const output: T[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = decode(value[i], `${path} ${i + 1}`);
      if (!item.ok) return item;
      output.push(item.value);
    }
    return { ok: true, value: output };
  };
}

const cardKind = enumKey(cardKindLabels);
const monsterType = enumKey(monsterTypeLabels);
const attribute = enumKey(attributeLabels);
const property = enumKey(spellTrapPropertyLabels);
const numericValue = integer(0, 99999, '数値');
const ids = array(id, 200);
const rangeFields = shape({ min: optional(numericValue), max: optional(numericValue) });
const range: Decoder<NumRange> = (value, path) => {
  const parsed = rangeFields(value, path);
  if (!parsed.ok) return parsed;
  const { min, max } = parsed.value;
  return min !== undefined && max !== undefined && min > max
    ? failure(path, '最小値は最大値以下にしてください') : parsed;
};

const predicate: Decoder<Predicate> = (value, path) => {
  const record = object(value, path);
  if (!record.ok) return record;
  const input = record.value;
  switch (input.kind) {
    case 'cardKind': return readFields({ kind: choice(['cardKind']), values: array(cardKind) }, input, path);
    case 'monsterType': return readFields({
      kind: choice(['monsterType']), values: array(monsterType), mode: choice(['any', 'all']),
    }, input, path);
    case 'attribute': return readFields({ kind: choice(['attribute']), values: array(attribute) }, input, path);
    case 'race': return readFields({ kind: choice(['race']), values: array(string(1, 100, '種族名')) }, input, path);
    case 'property': return readFields({ kind: choice(['property']), values: array(property) }, input, path);
    case 'cards': return readFields({ kind: choice(['cards']), cardIds: ids }, input, path);
    case 'level': case 'rank': case 'link': case 'atk': case 'def': case 'scale':
      return readFields({ kind: choice([input.kind]), range }, input, path);
    case 'nameContains': case 'archetype': case 'mentionsName':
      return readFields({ kind: choice([input.kind]), text: keyword }, input, path);
    case 'textContains': return readFields({
      kind: choice(['textContains']), text: keyword, includePendulum: boolean,
    }, input, path);
    default: return failure(`${path}.kind`, '不明な条件の種類です');
  }
};

export function validateFilter(value: unknown, path = '条件式'): Result<FilterNode> {
  let nodes = 0;
  function visit(input: unknown, location: string, depth: number): Result<FilterNode> {
    if (depth > 4) return failure(location, '条件式の深さが上限（4）を超えています');
    if (++nodes > 100) return failure(location, '条件式のノード総数が上限（100）を超えています');
    const record = object(input, location);
    if (!record.ok) return record;
    const node = record.value;
    switch (node.op) {
      case 'and': case 'or': return readFields({
        op: choice([node.op]), children: array((child, childPath) => visit(child, childPath, depth + 1), 50),
      }, node, location);
      case 'not': return readFields({
        op: choice(['not']), child: (child, childPath) => visit(child, childPath, depth + 1),
      }, node, location);
      case 'pred': return readFields({ op: choice(['pred']), pred: predicate }, node, location);
      default: return failure(`${location}.op`, '不明な条件式の演算子です');
    }
  }
  return visit(value, path, 1);
}

const cardData: Decoder<CardData> = shape({
  id, konamiId: optional(integer(1, Number.MAX_SAFE_INTEGER, '公式カード ID')),
  name: cardName, kana: optional(string(1, 100, '読み')), kind: cardKind,
  monsterTypes: array(monsterType), attribute: optional(attribute), race: optional(string(1, 100, '種族名')),
  level: optional(numericValue), rank: optional(numericValue), link: optional(numericValue),
  atk: optional(nullable(numericValue)), def: optional(nullable(numericValue)), scale: optional(numericValue),
  property: optional(property), text: cardText, pendulumText: optional(cardText), custom: optional(boolean),
});

export function validateCardData(value: unknown, path = 'カード'): Result<CardData> {
  return cardData(value, path);
}

const entry: Decoder<DeckEntry> = shape({
  cardId: id, name: cardName, count: integer(1, 60, '枚数'), section: choice(['main', 'extra', 'side']),
});
const group: Decoder<CardGroup> = shape({
  id, name: title, filter: validateFilter, include: ids, exclude: ids,
}, true);
const source: Decoder<SlotSource> = (value, path) => {
  const record = object(value, path);
  if (!record.ok) return record;
  switch (record.value.type) {
    case 'group': return readFields({ type: choice(['group']), groupId: id }, record.value, path);
    case 'card': return readFields({ type: choice(['card']), cardId: id }, record.value, path);
    default: return failure(`${path}.type`, '対象は group / card のいずれかで指定してください');
  }
};
const slot: Decoder<Slot> = shape({ id, source, count: integer(1, 5, '必要枚数'), distinctNames: boolean });
const pattern: Decoder<Pattern> = shape({ id, name: title, enabled: boolean, slots: array(slot, 8) }, true);
const pageData: Decoder<Record<string, CardData>> = (value, path) => {
  const record = object(value, path);
  if (!record.ok) return record;
  const entries = Object.entries(record.value);
  if (entries.length > 200) return failure(path, '件数が上限（200）を超えています');
  const cards: [string, CardData][] = [];
  for (const [key, input] of entries) {
    const card = validateCardData(input, `${path}.${key}`);
    if (!card.ok) return card;
    if (key !== card.value.id) return failure(`${path}.${key}`, 'キーとカードの ID が一致していません');
    cards.push([key, card.value]);
  }
  return { ok: true, value: Object.fromEntries(cards) };
};
const timestamp: Decoder<number> = (value, path) => typeof value === 'number' && Number.isFinite(value) && value >= 0
  ? { ok: true, value } : failure(path, '更新日時は 0 以上の有限の数値で指定してください');
const deckData: Decoder<Deck> = shape({
  id, name: title, entries: array(entry, 200), groups: array(group, 200),
  patterns: array(pattern, 200), customCards: array(cardData, 200), pageData, updatedAt: timestamp,
}, true);

function uniqueIds(items: { id: string }[], path: string): Result<Set<string>> {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) return failure(path, `ID『${item.id}』が重複しています`);
    seen.add(item.id);
  }
  return { ok: true, value: seen };
}

function readDeck(value: unknown, path: string, dropDanglingSlots: boolean): Result<{ deck: Deck; droppedSlots: number }> {
  const parsed = deckData(value, path);
  if (!parsed.ok) return parsed;
  const deck = parsed.value;
  const location = `${path}『${deck.name}』`;
  const groups = uniqueIds(deck.groups, `${location}のグループ`);
  if (!groups.ok) return groups;
  for (const [label, items] of [
    ['パターン', deck.patterns], ['スロット', deck.patterns.flatMap(item => item.slots)],
    ['カスタムカード', deck.customCards],
  ] as const) {
    const unique = uniqueIds(items, `${location}の${label}`);
    if (!unique.ok) return unique;
  }
  const entries = new Set<string>();
  for (let i = 0; i < deck.entries.length; i++) {
    const item = deck.entries[i];
    const key = JSON.stringify([item.section, item.cardId]);
    if (entries.has(key)) return failure(`${location}のエントリ ${i + 1}`, '同じ区分のカードが重複しています');
    entries.add(key);
  }
  let droppedSlots = 0;
  for (const item of deck.patterns) {
    const slots: Slot[] = [];
    for (const candidate of item.slots) {
      if (candidate.source.type === 'group' && !groups.value.has(candidate.source.groupId)) {
        if (!dropDanglingSlots) return failure(
          `${location}のパターン『${item.name}』のスロット『${candidate.id}』`,
          `参照先のグループ『${candidate.source.groupId}』が存在しません`,
        );
        droppedSlots++;
      } else slots.push(candidate);
    }
    item.slots = slots;
  }
  return { ok: true, value: { deck, droppedSlots } };
}

export function validateDeck(value: unknown, path = 'デッキ'): Result<Deck> {
  const parsed = readDeck(value, path, false);
  return parsed.ok ? { ok: true, value: parsed.value.deck } : parsed;
}

export function validateAppState(
  value: unknown, options: { dropDanglingSlots?: boolean } = {},
): Result<{ state: AppState; droppedSlots: number }> {
  let droppedSlots = 0;
  const parsed = shape({
    schemaVersion: choice([1]),
    decks: array((input, path) => {
      const deck = readDeck(input, path, options.dropDanglingSlots === true);
      if (!deck.ok) return deck;
      droppedSlots += deck.value.droppedSlots;
      return { ok: true, value: deck.value.deck };
    }, 50),
    activeDeckId: nullable(id),
    settings: shape({ customHandSize: nullable(integer(1, 10, '手札枚数')) }),
  })(value, 'アプリ状態');
  if (!parsed.ok) return parsed;
  const state = parsed.value;
  const unique = uniqueIds(state.decks, 'アプリ状態のデッキ');
  if (!unique.ok) return unique;
  if (state.activeDeckId !== null && !unique.value.has(state.activeDeckId)) {
    return failure('アプリ状態.activeDeckId', '選択中のデッキが存在しません');
  }
  return { ok: true, value: { state, droppedSlots } };
}
