import { createMemberMask } from './simulateMatch';
import type { SimulationEffect, SimulationStep } from './simulateTypes';
import type { SimulationState } from './simulateState';

/** 手順の対象と、同じ対象を使う手札コストの必要枚数。 */
export interface PreparedSimulationStep {
  step: SimulationStep;
  mask: Uint8Array;
  requiredCosts: number;
}

/** 発動条件を事前集計した効果。 */
export interface PreparedSimulationEffect {
  effect: SimulationEffect;
  steps: PreparedSimulationStep[];
  deckRequired: number;
  hasDraw: boolean;
}

/** 対象の順番によらず同じ集合の手札コストをまとめて数える。 */
export function prepareSimulationEffects(effects: SimulationEffect[], cardCount: number) {
  return effects.map(effect => {
    const steps = effect.steps.map(step => ({
      step, mask: createMemberMask('members' in step ? step.members : [], cardCount),
      requiredCosts: 0,
    }));
    const costKeys = steps.map(({ step, mask }) => {
      if (step.kind !== 'handCost' || step.whenMissing !== undefined) return null;
      return mask.join('');
    });
    steps.forEach((prepared, index) => {
      if (costKeys[index] !== null) {
        prepared.requiredCosts = costKeys.filter(key => key === costKeys[index]).length;
      }
    });
    let deckRequired = 0;
    for (const step of effect.steps) if ('count' in step) deckRequired += step.count;
    const hasDraw = effect.steps.some(step => step.kind === 'draw');
    return { effect, steps, deckRequired, hasDraw };
  });
}

/** 発動前の情報だけで効果全体を使えるか確かめる。 */
export function canUseSimulationEffect(
  prepared: PreparedSimulationEffect, state: SimulationState,
) {
  const { effect } = prepared;
  if (state.hand[effect.card] === 0) return false;
  if (effect.oncePerTurn && state.used[effect.card]) return false;
  if (effect.firstOnly && state.effectsUsed > 0) return false;
  if (effect.drawLock === 'turn' && state.hasDrawn) return false;
  if (state.isDrawLocked && prepared.hasDraw) return false;
  if (prepared.deckRequired > state.deckSize) return false;
  for (const { mask, requiredCosts } of prepared.steps) {
    if (requiredCosts === 0) continue;
    let available = -mask[effect.card];
    for (let i = 0; i < state.hand.length; i++) available += mask[i] * state.hand[i];
    if (available < requiredCosts) return false;
  }
  return true;
}
