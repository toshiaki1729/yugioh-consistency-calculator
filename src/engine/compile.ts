import { MAX_HAND_SIZE, MIN_HAND_SIZE } from '../domain/limits';
import type { CardData, CardId, Deck, Pattern, Result } from '../domain/types';
import { compileClassPatterns } from './compileClassPatterns';
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
  const active = deck.patterns.filter(pattern =>
    pattern.enabled && (pattern.slots.length > 0 || pattern.conditions.length > 0));
  if (hasUnsupportedCalculation(deck, counts, active)) {
    return { ok: false, error: 'ドロー効果と一部の条件はまだ計算できません' };
  }
  if (active.length === 0) return { ok: false, error: '有効な初動パターンがありません' };
  const settings = { ...DEFAULT_LIMITS, ...limits };
  if (!Number.isSafeInteger(settings.exactMaxStates) || settings.exactMaxStates < 0
    || !Number.isSafeInteger(settings.samples) || settings.samples < 1
    || !Number.isSafeInteger(settings.seed)) {
    return { ok: false, error: '計算上限は 0 以上、サンプル数は 1 以上の整数、シードは整数で指定してください' };
  }

  const compiled = compileClassPatterns(deck, counts, active, resolveCard);
  return {
    ok: true,
    value: { deckSize, ...compiled, handSizes: [...handSizes], limits: settings },
  };
}

// T27 でシミュレーションへ接続するまで、対応前の定義を無視して計算しない。
function hasUnsupportedCalculation(
  deck: Deck, counts: Map<CardId, number>, active: Pattern[],
) {
  return deck.effects.some(effect => (counts.get(effect.cardId) ?? 0) > 0)
    || active.some(pattern =>
      pattern.conditions.some(condition => condition.kind !== 'deckAtLeast'));
}
