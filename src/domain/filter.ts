import type { CardData, CardGroup, CardId, FilterNode } from './types';
import { escapeRegExp, normalizeForMatch, normalizeKana } from './normalize';
import { getRuleNames, removeRuleNameSentences } from './ruleNames';

const normalizedCards = new WeakMap<CardData, {
  name: string; kana: string; text: string; pendulumText: string;
  kanaName: string; kanaReading: string; kanaText: string;
  kanaRuleNames: string[]; mentionsText: string;
}>();
const archetypeSuffix = escapeRegExp(normalizeKana('カードとしても扱う'));

function getNormalizedCard(card: CardData) {
  let normalized = normalizedCards.get(card);
  if (!normalized) {
    normalized = {
      name: normalizeForMatch(card.name), kana: normalizeForMatch(card.kana ?? ''),
      text: normalizeForMatch(card.text), pendulumText: normalizeForMatch(card.pendulumText ?? ''),
      kanaName: normalizeKana(card.name), kanaReading: normalizeKana(card.kana ?? ''),
      kanaText: normalizeKana(card.text),
      kanaRuleNames: getRuleNames(card).map(normalizeKana),
      mentionsText: [card.text, card.pendulumText ?? '']
        .map(text => normalizeForMatch(removeRuleNameSentences(text))).join('\n'),
    };
    normalizedCards.set(card, normalized);
  }
  return normalized;
}

/** カードが条件式を満たすか判定する。 */
export function evaluateFilter(node: FilterNode, card: CardData): boolean {
  switch (node.op) {
    case 'and': return node.children.every(child => evaluateFilter(child, card));
    case 'or': return node.children.some(child => evaluateFilter(child, card));
    case 'not': return !evaluateFilter(node.child, card);
  }
  const predicate = node.pred;
  switch (predicate.kind) {
    case 'cardKind': return predicate.values.includes(card.kind);
    case 'monsterType': return predicate.mode === 'all'
      ? predicate.values.every(value => card.monsterTypes.includes(value))
      : predicate.values.some(value => card.monsterTypes.includes(value));
    case 'attribute': return card.attribute !== undefined
      && predicate.values.includes(card.attribute);
    case 'race': return card.race !== undefined && predicate.values.includes(card.race);
    case 'property': return card.property !== undefined && predicate.values.includes(card.property);
    case 'cards': return predicate.cardIds.includes(card.id);
    case 'level': case 'rank': case 'link': case 'atk': case 'def': case 'scale': {
      const value = card[predicate.kind];
      return value !== undefined && value !== null
        && (predicate.range.min === undefined || value >= predicate.range.min)
        && (predicate.range.max === undefined || value <= predicate.range.max);
    }
  }
  const normalized = getNormalizedCard(card);
  if (predicate.kind === 'nameContains' || predicate.kind === 'archetype') {
    const keyword = normalizeKana(predicate.text);
    if (!keyword) return false;
    const hasName = normalized.kanaName.includes(keyword)
      || normalized.kanaReading.includes(keyword)
      || normalized.kanaRuleNames.some(name => name.includes(keyword));
    if (hasName) return true;
    return predicate.kind === 'archetype'
      && new RegExp(`「[^」]*${escapeRegExp(keyword)}[^」]*」${archetypeSuffix}`)
        .test(normalized.kanaText);
  }
  const keyword = normalizeForMatch(predicate.text);
  switch (predicate.kind) {
    case 'textContains': return normalized.text.includes(keyword)
      || (predicate.includePendulum && normalized.pendulumText.includes(keyword));
    case 'mentionsName': {
      // 効果欄の境界をまたいだ引用を作らず、自己参照をすべて除いて調べる。
      const text = normalized.mentionsText.split(`「${normalized.name}」`).join('');
      return new RegExp(`「${escapeRegExp(keyword)}」(?!モンスター|カード|魔法|罠)`).test(text);
    }
  }
}

/** 手動の除外・追加を優先してグループへの所属を判定する。 */
export function isInGroup(group: CardGroup, cardId: CardId, card: CardData | undefined): boolean {
  if (group.exclude.includes(cardId)) return false;
  if (group.include.includes(cardId)) return true;
  return card !== undefined && evaluateFilter(group.filter, card);
}
