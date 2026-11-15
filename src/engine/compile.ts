import { isInGroup } from '../domain/filter';
import type { CardData, CardId, Deck, Result } from '../domain/types';
import { DEFAULT_LIMITS } from './types';
import type { EngineInput, EngineLimits } from './types';

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
  if (deckSize > 60) {
    return { ok: false, error: `メインデッキが 60 枚を超えているため計算できません（現在 ${deckSize} 枚）` };
  }
  for (const h of handSizes) {
    if (!Number.isInteger(h) || h < 1 || h > 10) {
      return { ok: false, error: `手札枚数 ${h} は 1〜10 の整数で指定してください` };
    }
    if (h > deckSize) {
      return { ok: false, error: `手札枚数 ${h} はメインデッキの枚数（${deckSize} 枚）を超えています` };
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

  const groups = new Map(deck.groups.map(group => [group.id, group]));
  const slots = active.flatMap(pattern => pattern.slots);
  const members = slots.map(() => [] as number[]);
  const classes: EngineInput['classes'] = [];
  const classIndices = new Map<string, number>();
  let otherCount = 0;
  for (const [cardId, count] of counts) {
    const card = resolveCard(cardId);
    const membership: number[] = [];
    let distinct = false;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const group = slot.source.type === 'group' ? groups.get(slot.source.groupId) : undefined;
      const matches = slot.source.type === 'card'
        ? slot.source.cardId === cardId
        : group !== undefined && isInGroup(group, cardId, card);
      if (matches) {
        membership.push(i);
        distinct ||= slot.distinctNames;
      }
    }
    if (membership.length === 0) {
      otherCount += count;
      continue;
    }
    const key = distinct ? `card:${cardId}` : `slots:${membership.join(',')}`;
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
