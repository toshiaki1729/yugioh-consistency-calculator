import type { MoveZone } from '../domain/types';

/** 目標間と試行間で配列を再利用する作業状態。 */
export interface SimulationState {
  hand: Uint8Array;
  deck: Uint8Array;
  deckCounts: Uint8Array;
  deckSize: number;
  moved: Record<MoveZone, Uint8Array>;
  used: Uint8Array;
  effectsUsed: number;
  hasDrawn: boolean;
  isDrawLocked: boolean;
  candidates: Uint8Array;
  excavated: Uint8Array;
}

/** デッキの総枚数とカード種類数から作業領域を確保する。 */
export function createSimulationState(cardCount: number, deckSize: number): SimulationState {
  return {
    hand: new Uint8Array(cardCount), deck: new Uint8Array(deckSize),
    deckCounts: new Uint8Array(cardCount), deckSize: 0,
    moved: {
      graveyard: new Uint8Array(cardCount), banishedFaceUp: new Uint8Array(cardCount),
      banishedFaceDown: new Uint8Array(cardCount),
    },
    used: new Uint8Array(cardCount), effectsUsed: 0, hasDrawn: false, isDrawLocked: false,
    candidates: new Uint8Array(cardCount), excavated: new Uint8Array(deckSize),
  };
}

/** 指定された並びをコピーして各目標を同じ初手から始める。 */
export function resetSimulationState(
  state: SimulationState, order: ArrayLike<number>, handSize: number,
) {
  state.hand.fill(0);
  state.deckCounts.fill(0);
  state.used.fill(0);
  state.moved.graveyard.fill(0);
  state.moved.banishedFaceUp.fill(0);
  state.moved.banishedFaceDown.fill(0);
  state.effectsUsed = 0;
  state.hasDrawn = false;
  state.isDrawLocked = false;
  state.deckSize = order.length - handSize;
  for (let i = 0; i < handSize; i++) state.hand[order[i]]++;
  for (let i = handSize; i < order.length; i++) {
    state.deck[i - handSize] = order[i];
    state.deckCounts[order[i]]++;
  }
}

/** 並びを保ったまま、デッキの指定位置からカードを取り出す。 */
export function takeDeckCard(state: SimulationState, index: number) {
  const card = state.deck[index];
  state.deck.copyWithin(index, index + 1, state.deckSize);
  state.deckSize--;
  state.deckCounts[card]--;
  return card;
}
