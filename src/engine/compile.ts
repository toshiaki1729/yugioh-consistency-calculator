import { isInGroup } from '../domain/filter';
import { MAX_HAND_SIZE, MIN_HAND_SIZE } from '../domain/limits';
import type { CardData, CardId, Deck, Result, Slot } from '../domain/types';
import { DEFAULT_LIMITS } from './types';
import type { EngineInput, EngineLimits } from './types';
import { MAX_DECK_SIZE } from './constants';

/** メインデッキと初動条件を計算用クラスに集約する。 */
export function compile(
  deck: Deck,
  resolveCard: (id: CardId) => CardData | undefined,
  handSizes: number[],
  limits?: Partial<EngineLimits>,
): Result<EngineInput, string> {
  const counts = new Map<CardId, number>();
  let deckSize = 0;
  for (const entry of deck.entries) {
    if (entry.section !== 'main') continue;
    counts.set(entry.cardId, (counts.get(entry.cardId) ?? 0) + entry.count);
    deckSize += entry.count;
  }
  if (deckSize > MAX_DECK_SIZE) {
    return { ok: false, error: `メインデッキが 60 枚を超えているため計算できません（現在 ${deckSize} 枚）` };
  }
  for (const handSize of handSizes) {
    if (!Number.isInteger(handSize) || handSize < MIN_HAND_SIZE || handSize > MAX_HAND_SIZE) {
      return { ok: false, error: `手札枚数 ${handSize} は 1〜10 の整数で指定してください` };
    }
    if (handSize > deckSize) {
      return { ok: false, error: `手札枚数 ${handSize} はメインデッキの枚数（${deckSize} 枚）を超えています` };
    }
  }
  const active = deck.patterns.filter(pattern => pattern.enabled && pattern.slots.length > 0);
  if (active.length === 0) return { ok: false, error: '有効な初動パターンがありません' };
  const settings = { ...DEFAULT_LIMITS, ...limits };
  if (!Number.isSafeInteger(settings.exactMaxStates) || settings.exactMaxStates < 0
    || !Number.isSafeInteger(settings.samples) || settings.samples < 1
    || !Number.isSafeInteger(settings.seed)) {
    return { ok: false, error: '計算上限は 0 以上、サンプル数は 1 以上の整数、シードは整数で指定してください' };
  }

  const slots = active.flatMap(pattern => pattern.slots);
  const { classes, otherCount, members } = collectClasses(deck, counts, slots, resolveCard);
  let slotIndex = 0;
  const patterns = active.map(pattern => ({
    id: pattern.id,
    slots: pattern.slots.map(slot => ({
      count: slot.count,
      distinct: slot.distinctNames,
      members: members[slotIndex++],
    })),
  }));
  return {
    ok: true,
    value: { deckSize, classes, otherCount, patterns, handSizes: [...handSizes], limits: settings },
  };
}

function collectClasses(
  deck: Deck, counts: Map<CardId, number>, slots: Slot[],
  resolveCard: (id: CardId) => CardData | undefined,
) {
  const groups = new Map(deck.groups.map(group => [group.id, group]));
  const members = slots.map(() => [] as number[]);
  const classes: EngineInput['classes'] = [];
  const classIndices = new Map<string, number>();
  let otherCount = 0;
  for (const [cardId, count] of counts) {
    const card = resolveCard(cardId);
    const membership: number[] = [];
    let hasDistinctSlot = false;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const group = slot.source.type === 'group' ? groups.get(slot.source.groupId) : undefined;
      const isMatch = slot.source.type === 'card'
        ? slot.source.cardId === cardId
        : group !== undefined && isInGroup(group, cardId, card);
      if (isMatch) {
        membership.push(i);
        hasDistinctSlot ||= slot.distinctNames;
      }
    }
    if (membership.length === 0) {
      otherCount += count;
      continue;
    }
    const key = hasDistinctSlot ? `card:${cardId}` : `slots:${membership.join(',')}`;
    const existing = classIndices.get(key);
    if (existing !== undefined) {
      classes[existing].count += count;
    } else {
      const index = classes.length;
      classIndices.set(key, index);
      classes.push({ key, count });
      for (const slotIndex of membership) members[slotIndex].push(index);
    }
  }
  return { classes, otherCount, members };
}
