import type { CardData, CardId, Deck, Result } from '../domain/types';
import { compileClassPatterns } from './compileClassPatterns';
import { prepareCompilation } from './compilePreparation';
import { compileSimulation } from './compileSimulation';
import type { CalculationInput, EngineLimits } from './types';

/** デッキの条件と効果に応じた方式の計算入力を作る。 */
export function compileCalculation(
  deck: Deck, resolveCard: (id: CardId) => CardData | undefined,
  handSizes: number[], limits?: Partial<EngineLimits>,
): Result<CalculationInput> {
  const prepared = prepareCompilation(deck, handSizes, limits);
  if (!prepared.ok) return prepared;
  const { counts, deckSize, fillCount, active, settings, isSimulation } = prepared.value;
  const shared = { handSizes: [...handSizes], limits: settings };
  if (isSimulation) {
    const compiled = compileSimulation(deck, counts, active, resolveCard, fillCount);
    return { ok: true, value: { mode: 'simulation', input: { ...compiled, ...shared } } };
  }
  const compiled = compileClassPatterns(deck, counts, active, resolveCard, fillCount);
  return { ok: true, value: { mode: 'classes', input: { deckSize, ...compiled, ...shared } } };
}
