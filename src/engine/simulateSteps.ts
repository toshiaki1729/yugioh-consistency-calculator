import type { PreparedSimulationEffect, PreparedSimulationStep } from './simulateEffects';
import type { SimulationGoal } from './simulateMatch';
import { takeDeckCard, type SimulationState } from './simulateState';
import type { SimulationStep } from './simulateTypes';

function chooseCard(state: SimulationState, goal: SimulationGoal, step: SimulationStep) {
  const isCost = step.kind === 'handCost';
  const scores = isCost ? goal.costScores : goal.gainScores;
  const otherZone = isCost ? state.moved[step.destination] : state.deckCounts;
  const handChange = isCost ? -1 : 1;
  let chosen = -1;
  for (let card = 0; card < state.hand.length; card++) {
    if (!state.candidates[card]) continue;
    state.hand[card] += handChange;
    otherZone[card] -= handChange;
    const isSuccess = goal.matches(state, false);
    state.hand[card] -= handChange;
    otherZone[card] += handChange;
    if (isSuccess) return card;
    const isBetter = chosen < 0 || (isCost
      ? scores[card] < scores[chosen] : scores[card] > scores[chosen]);
    if (isBetter) chosen = card;
  }
  return chosen;
}

function excavateCards(
  prepared: PreparedSimulationStep, state: SimulationState, goal: SimulationGoal,
) {
  const { step, mask } = prepared;
  if (step.kind !== 'excavate') return;
  const count = Math.min(step.count, state.deckSize);
  state.candidates.fill(0);
  for (let i = 0; i < count; i++) {
    const card = state.deck[i];
    state.excavated[i] = card;
    state.candidates[card] = mask[card];
  }
  const chosen = chooseCard(state, goal, step);
  state.deck.copyWithin(0, count, state.deckSize);
  state.deckSize -= count;
  let hasTaken = false;
  for (let i = 0; i < count; i++) {
    const card = state.excavated[i];
    if (card === chosen && !hasTaken) {
      state.hand[card]++;
      state.deckCounts[card]--;
      hasTaken = true;
    } else state.deck[state.deckSize++] = card;
  }
}

function selectCard(
  prepared: PreparedSimulationStep, state: SimulationState,
  goal: SimulationGoal, random: () => number,
) {
  const { step, mask } = prepared;
  if (step.kind !== 'search' && step.kind !== 'handCost') return;
  const available = step.kind === 'search' ? state.deckCounts : state.hand;
  for (let i = 0; i < available.length; i++) {
    state.candidates[i] = Number(mask[i] > 0 && available[i] > 0);
  }
  const chosen = chooseCard(state, goal, step);
  if (chosen < 0) {
    if (step.kind === 'handCost' && step.whenMissing !== undefined) {
      const destination = state.moved[step.whenMissing];
      for (let i = 0; i < state.hand.length; i++) {
        destination[i] += state.hand[i];
        state.hand[i] = 0;
      }
    }
    return;
  }
  if (step.kind === 'handCost') {
    state.hand[chosen]--;
    state.moved[step.destination][chosen]++;
    return;
  }
  takeDeckCard(state, state.deck.indexOf(chosen));
  state.hand[chosen]++;
  for (let i = state.deckSize - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const card = state.deck[i];
    state.deck[i] = state.deck[j];
    state.deck[j] = card;
  }
}

/** 効果を最後まで処理し、途中の成功では停止しない。 */
export function applySimulationEffect(
  prepared: PreparedSimulationEffect, state: SimulationState,
  goal: SimulationGoal, random: () => number,
) {
  const { effect } = prepared;
  state.hand[effect.card]--;
  state.used[effect.card] = 1;
  state.effectsUsed++;
  for (const preparedStep of prepared.steps) {
    const { step } = preparedStep;
    if (step.kind === 'excavate') excavateCards(preparedStep, state, goal);
    if (step.kind === 'search' || step.kind === 'handCost') {
      selectCard(preparedStep, state, goal, random);
    }
    if (step.kind !== 'draw' && step.kind !== 'banishTop') continue;
    const count = Math.min(step.count, state.deckSize);
    const destination = step.kind === 'draw' ? state.hand : state.moved.banishedFaceDown;
    for (let i = 0; i < count; i++) destination[takeDeckCard(state, 0)]++;
    if (step.kind === 'draw' && count > 0) state.hasDrawn = true;
  }
  if (effect.drawLock !== 'none') state.isDrawLocked = true;
}
