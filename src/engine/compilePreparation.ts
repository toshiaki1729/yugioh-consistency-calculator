import { MAX_HAND_SIZE, MIN_HAND_SIZE } from '../domain/limits';
import type { CardId, Deck, Pattern, Result } from '../domain/types';
import { MAX_DECK_SIZE } from './constants';
import { DEFAULT_LIMITS } from './types';
import type { EngineLimits } from './types';

interface CompilationPreparation {
  counts: Map<CardId, number>;
  deckSize: number;
  active: Pattern[];
  settings: EngineLimits;
  isSimulation: boolean;
}

/** 両方式で共通の枚数・パターン・計算設定を検証し、方式を選ぶ。 */
export function prepareCompilation(
  deck: Deck, handSizes: number[], limits?: Partial<EngineLimits>, isClassesOnly = false,
): Result<CompilationPreparation> {
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
  const isSimulation = deck.effects.some(effect => (counts.get(effect.cardId) ?? 0) > 0)
    || active.some(pattern =>
      pattern.conditions.some(condition => condition.kind === 'deckAfterBanish'));
  if (isClassesOnly && isSimulation) {
    return { ok: false, error: 'この計算には compileCalculation を使ってください' };
  }
  if (active.length === 0) return { ok: false, error: '有効な初動パターンがありません' };
  const settings = { ...DEFAULT_LIMITS, ...limits };
  if (!Number.isSafeInteger(settings.exactMaxStates) || settings.exactMaxStates < 0
    || !Number.isSafeInteger(settings.samples) || settings.samples < 1
    || !Number.isSafeInteger(settings.seed)) {
    return { ok: false, error: '計算上限は 0 以上、サンプル数は 1 以上の整数、シードは整数で指定してください' };
  }
  return { ok: true, value: { counts, deckSize, active, settings, isSimulation } };
}
