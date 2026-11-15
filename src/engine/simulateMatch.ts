import { createHandMatcher } from './flow';
import type { SimulationCondition, SimulationPattern } from './simulateTypes';
import type { SimulationState } from './simulateState';

/** 判定器と選択の得点を事前計算した目標。 */
export interface SimulationGoal {
  matches: (state: SimulationState, isFinal: boolean) => boolean;
  gainScores: Uint16Array;
  costScores: Uint16Array;
}

/** カード番号の集合を定数時間で照合できる配列にする。 */
export function createMemberMask(members: number[] | null, cardCount: number) {
  const mask = new Uint8Array(cardCount);
  if (members === null) return mask.fill(1);
  for (const card of members) mask[card] = 1;
  return mask;
}

function matchesCondition(
  condition: SimulationCondition, mask: Uint8Array, state: SimulationState, isFinal: boolean,
) {
  if (condition.kind === 'deckAfterBanish') {
    if (!isFinal) return true;
    let remaining = 0;
    for (let i = condition.banish; i < state.deckSize; i++) remaining += mask[state.deck[i]];
    return remaining >= condition.count;
  }
  let count = 0;
  if (condition.kind === 'deckAtLeast') {
    for (const card of condition.members) count += state.deckCounts[card];
    return count >= condition.count;
  }
  for (const zone of condition.zones) {
    for (const card of condition.members) count += state.moved[zone][card];
  }
  return condition.kind === 'movedIncludes' ? count > 0 : count === 0;
}

/** 既存の最大流を総枚数上限で準備し、効果後に増えた手札も判定する。 */
export function createSimulationGoals(
  patterns: SimulationPattern[], cardCount: number, deckSize: number,
): SimulationGoal[] {
  const prepared = patterns.map(pattern => {
    const matchesSlots = createHandMatcher([{ ...pattern, conditions: [] }], deckSize);
    const conditions = pattern.conditions.map(condition => ({
      condition, mask: createMemberMask(condition.members, cardCount),
    }));
    return (state: SimulationState, isFinal: boolean) => {
      for (const { condition, mask } of conditions) {
        if (!matchesCondition(condition, mask, state, isFinal)) return false;
      }
      return matchesSlots(state.hand);
    };
  });
  function createGoal(indices: number[]): SimulationGoal {
    const gainScores = new Uint16Array(cardCount);
    const costScores = new Uint16Array(cardCount);
    for (const index of indices) {
      for (const slot of patterns[index].slots) {
        for (const card of slot.members) gainScores[card]++;
      }
      for (const condition of patterns[index].conditions) {
        for (const card of condition.members) costScores[card]++;
      }
    }
    for (let i = 0; i < cardCount; i++) costScores[i] += gainScores[i];
    return {
      gainScores, costScores,
      matches: (state, isFinal) => {
        for (const index of indices) if (prepared[index](state, isFinal)) return true;
        return false;
      },
    };
  }
  const indices = patterns.map((_, index) => index);
  return [createGoal(indices), ...indices.map(index => createGoal([index]))];
}
