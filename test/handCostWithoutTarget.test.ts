import { describe, expect, it } from 'vitest';
import { runTrial } from '../src/engine/simulate';
import { canUseSimulationEffect, prepareSimulationEffects } from '../src/engine/simulateEffects';
import { createSimulationGoals } from '../src/engine/simulateMatch';
import { createSimulationState, resetSimulationState } from '../src/engine/simulateState';
import { applySimulationEffect } from '../src/engine/simulateSteps';
import type { SimulationCondition, SimulationEffect, SimulationPattern, SimulationStep } from '../src/engine/simulateTypes';
import { DEFAULT_LIMITS } from '../src/engine/types';

// カード番号は A=0（初動）、D=1（対象）、E=2（効果）、X=3（その他）。
const draw = (count = 1): SimulationStep => ({ kind: 'draw', count });
const cost = (whenMissing?: 'graveyard' | 'banishedFaceUp'): SimulationStep => ({
  kind: 'handCost', members: [1], destination: 'banishedFaceUp',
  ...(whenMissing === undefined ? {} : { whenMissing }),
});
const moved = (card: number, zone: 'graveyard' | 'banishedFaceUp',
  kind: 'movedIncludes' | 'movedExcludes' = 'movedIncludes'): SimulationCondition =>
  ({ kind, zones: [zone], members: [card] });
function pattern(conditions: SimulationCondition[], members?: number[]): SimulationPattern {
  return { id: 'P', conditions, slots: members ? [{ members, count: 1, distinct: false }] : [] };
}
function effect(steps: SimulationStep[]): SimulationEffect {
  return { card: 2, oncePerTurn: false, firstOnly: false, drawLock: 'none', steps };
}
function trial(order: number[], handSize: number, steps: SimulationStep[], patterns: SimulationPattern[]) {
  const cards = Array.from({ length: 4 }, (_, card) => ({
    key: `k${card + 1}`, count: order.filter(value => value === card).length,
  }));
  const input = { cards, patterns, effects: [effect(steps)], handSizes: [handSize], limits: DEFAULT_LIMITS };
  return runTrial(input, order, handSize, () => () => 0.99);
}

describe('対象が無くても使う手放す手順', () => {
  it('発動前に対象が無くても使い、引いた対象だけを通常の送り先へ送る', () => {
    const patterns = [
      pattern([moved(1, 'banishedFaceUp')], [0]),
      pattern([moved(1, 'banishedFaceUp')], [3]),
      pattern([moved(1, 'graveyard')]),
    ];
    expect(trial([2, 3, 0, 1], 2, [draw(2), cost('graveyard')], patterns))
      .toStrictEqual({ overall: true, perPattern: [true, true, false] });
    expect(trial([2, 3, 0, 1], 2, [draw(2), cost()], patterns))
      .toStrictEqual({ overall: false, perPattern: [false, false, false] });
  });

  it.each(['graveyard', 'banishedFaceUp'] as const)(
    '引いた後も対象が無ければ手札をすべて %s へ送り、手札のスロットは満たさない', zone => {
      const otherZone = zone === 'graveyard' ? 'banishedFaceUp' : 'graveyard';
      const patterns = [
        pattern([moved(3, zone), moved(0, zone), moved(2, zone, 'movedExcludes')]),
        pattern([moved(3, zone)], [0]),
        pattern([moved(3, zone)], [3]),
        pattern([moved(3, zone), moved(3, zone, 'movedExcludes')]),
        pattern([moved(3, zone), moved(3, otherZone, 'movedExcludes')]),
        pattern([moved(2, zone)]),
      ];
      expect(trial([2, 3, 0, 3], 2, [draw(2), cost(zone)], patterns))
        .toStrictEqual({ overall: true, perPattern: [true, false, false, false, true, false] });
    },
  );

  it.each([true, false])('同じ対象の手順が混在すると必須分だけ確認し、順番どおりに処理する（任意が先=%s）', isOptionalFirst => {
    const steps = isOptionalFirst ? [cost('graveyard'), cost()] : [cost(), cost('graveyard')];
    const patterns = [
      pattern([moved(1, 'banishedFaceUp')], [3]),
      pattern([moved(3, 'graveyard')]),
    ];
    const prepared = prepareSimulationEffects([effect(steps)], 4)[0];
    expect(prepared.steps.map(step => step.requiredCosts)).toEqual(isOptionalFirst ? [0, 1] : [1, 0]);
    expect(trial([2, 1, 3], 3, steps, patterns))
      .toStrictEqual({ overall: true, perPattern: [isOptionalFirst, !isOptionalFirst] });
    expect(trial([2, 3], 2, steps, patterns))
      .toStrictEqual({ overall: false, perPattern: [false, false] });
  });

  it('同じ対象の必須手順が2つあると、任意の手順を除いた2枚を要求する', () => {
    const prepared = prepareSimulationEffects([effect([cost(), cost('graveyard'), cost()])], 4)[0];
    expect(prepared.steps.map(step => step.requiredCosts)).toEqual([2, 0, 2]);
    const state = createSimulationState(4, 4);
    resetSimulationState(state, [2, 1, 3], 3);
    expect(canUseSimulationEffect(prepared, state)).toBe(false);
    resetSimulationState(state, [2, 1, 1, 3], 4);
    expect(canUseSimulationEffect(prepared, state)).toBe(true);
  });

  it('全手札を失った後も次のドローを処理する', () => {
    const patterns = [pattern([moved(3, 'graveyard')], [0])];
    expect(trial([2, 3, 0], 2, [cost('graveyard'), draw()], patterns))
      .toStrictEqual({ overall: true, perPattern: [true] });
  });

  it('必須の手順で処理時に対象が無くなった場合は何も送らず次のドローへ進む', () => {
    const patterns = [pattern([moved(1, 'banishedFaceUp'), moved(3, 'graveyard', 'movedExcludes')], [0])];
    expect(trial([2, 1, 3, 0], 3, [cost('graveyard'), cost(), draw()], patterns))
      .toStrictEqual({ overall: true, perPattern: [true] });
  });

  it('前の手順の移動記録に残りの手札枚数を加算し、発動カードを記録しない', () => {
    const state = createSimulationState(4, 4);
    resetSimulationState(state, [2, 3, 3, 0], 4);
    const steps: SimulationStep[] = [
      { kind: 'handCost', members: [3], destination: 'graveyard' }, cost('graveyard'),
    ];
    const prepared = prepareSimulationEffects([effect(steps)], 4)[0];
    const goal = createSimulationGoals([pattern([moved(0, 'graveyard')])], 4, 4)[0];
    expect(canUseSimulationEffect(prepared, state)).toBe(true);
    applySimulationEffect(prepared, state, goal, () => 0.99);
    expect(Array.from(state.hand)).toEqual([0, 0, 0, 0]);
    expect(Array.from(state.moved.graveyard)).toEqual([1, 0, 0, 2]);
    expect(Array.from(state.moved.banishedFaceUp)).toEqual([0, 0, 0, 0]);
    expect(state.effectsUsed).toBe(1);
  });

  it('対象がある場合の選択は whenMissing の有無で変わらない', () => {
    const patterns = [pattern([moved(1, 'banishedFaceUp')], [0])];
    const steps: SimulationStep[] = [
      { kind: 'handCost', members: [0, 1], destination: 'banishedFaceUp' },
    ];
    expect(trial([2, 0, 1], 3, steps, patterns)).toStrictEqual({ overall: true, perPattern: [true] });
    expect(trial([2, 0, 1], 3, [{ ...steps[0], whenMissing: 'graveyard' } as SimulationStep], patterns))
      .toStrictEqual({ overall: true, perPattern: [true] });
  });

  it('対象の確認を省いても、ドローに必要なデッキ枚数は確認する', () => {
    expect(trial([2, 3, 0], 2, [draw(2), cost('graveyard')], [pattern([moved(3, 'graveyard')])]))
      .toStrictEqual({ overall: false, perPattern: [false] });
  });
});
