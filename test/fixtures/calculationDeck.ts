import type { CardData, Deck, DrawEffect, EffectStep } from '../../src/domain/types';
import { compileCalculation } from '../../src/engine/compileCalculation';
import type { EngineLimits } from '../../src/engine/types';

export function createCalculationDeck(counts = [3, 3, 34]): Deck {
  return {
    id: 'deck', name: '計算接続', updatedAt: 0, customCards: [], pageData: {},
    entries: counts.map((count, index) => ({
      cardId: `k${index + 1}`, name: `カード${index + 1}`, count, section: 'main',
    })),
    groups: [{
      id: 'starter', name: '初動', include: [], exclude: [],
      filter: { op: 'pred', pred: { kind: 'attribute', values: ['dark'] } },
    }],
    patterns: [{
      id: 'P', name: '初動', enabled: true, conditions: [],
      slots: [{ id: 's', source: { type: 'group', groupId: 'starter' }, count: 1, distinctNames: false }],
    }],
    effects: [createCalculationEffect()],
  };
}

export function createCalculationEffect(
  steps: EffectStep[] = [{ kind: 'draw', count: 1 }],
): DrawEffect {
  return { id: 'effect', cardId: 'k2', oncePerTurn: false, firstOnly: false, drawLock: 'none', steps };
}

export function resolveCalculationCard(id: string): CardData {
  return {
    id, name: id, kind: 'monster', monsterTypes: ['effect'], text: '',
    attribute: id === 'k1' ? 'dark' : 'light',
  };
}

export function compileCalculationDeck(
  deck: Deck, handSizes = [5], limits?: Partial<EngineLimits>,
) {
  const result = compileCalculation(deck, resolveCalculationCard, handSizes, limits);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
