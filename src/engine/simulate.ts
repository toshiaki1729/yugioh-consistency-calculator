import { canUseSimulationEffect, prepareSimulationEffects } from './simulateEffects';
import { createSimulationGoals } from './simulateMatch';
import { createSimulationState, resetSimulationState } from './simulateState';
import { applySimulationEffect } from './simulateSteps';
import type { CreateTrialRandom, SimulationInput, TrialResult } from './simulateTypes';

/** 検証済み入力から判定器と作業領域を一度だけ作り、同期的な反復試行に使う。 */
export function createTrialRunner(input: SimulationInput) {
  const deckSize = input.cards.reduce((sum, card) => sum + card.count, 0);
  const state = createSimulationState(input.cards.length, deckSize);
  const goals = createSimulationGoals(input.patterns, input.cards.length, deckSize);
  const effects = prepareSimulationEffects(input.effects, input.cards.length);
  return (
    order: ArrayLike<number>, handSize: number, createRandom: CreateTrialRandom,
  ): TrialResult => {
    let overall = false;
    const perPattern: boolean[] = [];
    for (let i = 0; i < goals.length; i++) {
      resetSimulationState(state, order, handSize);
      const random = createRandom();
      const goal = goals[i];
      while (!goal.matches(state, false)) {
        const effect = effects.find(candidate => canUseSimulationEffect(candidate, state));
        if (!effect) break;
        applySimulationEffect(effect, state, goal, random);
      }
      const isSuccess = goal.matches(state, true);
      if (i === 0) overall = isSuccess;
      else perPattern.push(isSuccess);
    }
    return { overall, perPattern };
  };
}

/** 並びと同一列の乱数源を指定して一試行する。反復時は createTrialRunner を使う。 */
export function runTrial(
  input: SimulationInput, order: ArrayLike<number>, handSize: number,
  createRandom: CreateTrialRandom,
): TrialResult {
  return createTrialRunner(input)(order, handSize, createRandom);
}
