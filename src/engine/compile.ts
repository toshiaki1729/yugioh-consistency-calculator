import type { CardData, CardId, Deck, Result } from '../domain/types';
import { compileClassPatterns } from './compileClassPatterns';
import { prepareCompilation } from './compilePreparation';
import type { EngineInput, EngineLimits } from './types';

/** メインデッキと初動条件を計算用クラスに集約する。 */
export function compile(
  deck: Deck,
  resolveCard: (id: CardId) => CardData | undefined,
  handSizes: number[],
  limits?: Partial<EngineLimits>,
): Result<EngineInput, string> {
  const prepared = prepareCompilation(deck, handSizes, limits, true);
  if (!prepared.ok) return prepared;
  const { counts, deckSize, fillCount, active, settings } = prepared.value;
  const compiled = compileClassPatterns(deck, counts, active, resolveCard, fillCount);
  return {
    ok: true,
    value: { deckSize, ...compiled, handSizes: [...handSizes], limits: settings },
  };
}
