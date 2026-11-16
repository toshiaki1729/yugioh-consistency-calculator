import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CardTarget } from '../src/domain/types';
import { compile } from '../src/engine/compile';
import { compileCalculation } from '../src/engine/compileCalculation';
import { FILL_CARD_KEY } from '../src/engine/constants';
import { runTrial } from '../src/engine/simulate';
import * as simulationSteps from '../src/engine/simulateSteps';
import {
  compileCalculationDeck, createCalculationDeck, createCalculationEffect, resolveCalculationCard,
} from './fixtures/calculationDeck';

afterEach(() => vi.restoreAllMocks());

function resolveSameNameCard(id: string) {
  return { ...resolveCalculationCard(id), name: id === 'k2' ? 'k1' : id };
}

describe('補充カードは対象解決に含めない', () => {
  it('全カードに一致するグループでも classes のスロット・種類違い・残り条件から外れる', () => {
    const deck = createCalculationDeck([3, 3, 29]);
    deck.effects = [];
    deck.groups[0].filter = { op: 'and', children: [] };
    deck.patterns[0].slots[0].distinctNames = true;
    deck.patterns[0].slots[0].count = 2;
    deck.patterns[0].conditions = [{
      kind: 'deckAtLeast', target: { type: 'group', groupId: 'starter' }, count: 1,
    }];
    const original = compile(deck, resolveSameNameCard, [5, 6]);
    const filled = compile({ ...deck, mainFillTarget: 40 }, resolveSameNameCard, [5, 6]);
    if (!original.ok || !filled.ok) throw new Error('コンパイル失敗');
    expect(original.value.otherCount).toBe(0);
    expect(filled.value).toEqual({ ...original.value, deckSize: 40, otherCount: 5 });
    expect(filled.value.patterns[0].slots[0].members).toEqual([0, 1, 2]);
    expect(filled.value.patterns[0].slots[0].distinctGroups).toEqual([[0, 1], [2]]);
    expect(filled.value.patterns[0].conditions[0].members).toEqual([0, 1, 2]);
  });

  it('全カードのグループを使う全対象から補充分を外し、既存カード番号を保つ', () => {
    const deck = createCalculationDeck([3, 3, 29]);
    const target: CardTarget = { type: 'group', groupId: 'starter' };
    deck.groups[0].filter = { op: 'and', children: [] };
    deck.patterns[0].slots.push({
      id: 'distinct', source: target, count: 2, distinctNames: true,
    });
    deck.patterns[0].conditions = [
      { kind: 'deckAtLeast', target, count: 1 },
      { kind: 'deckAfterBanish', target, banish: 3, count: 1 },
      { kind: 'movedExcludes', target, zones: ['graveyard', 'banishedFaceDown'] },
      { kind: 'movedIncludes', target, zones: ['banishedFaceUp'] },
    ];
    deck.effects = [createCalculationEffect([
      { kind: 'search', target },
      { kind: 'handCost', target, destination: 'graveyard' },
      { kind: 'excavate', count: 3, target },
      { kind: 'excavate', count: 1, target: null },
    ])];
    const before = compileCalculation(deck, resolveSameNameCard, [5]);
    const after = compileCalculation({ ...deck, mainFillTarget: 40 }, resolveSameNameCard, [5]);
    if (!before.ok || !after.ok) throw new Error('コンパイル失敗');
    const original = before.value;
    const filled = after.value;
    if (original.mode !== 'simulation' || filled.mode !== 'simulation') throw new Error('方式不一致');
    const fillerIndex = original.input.cards.length;
    expect(filled.input.cards).toEqual([...original.input.cards, { key: FILL_CARD_KEY, count: 5 }]);
    expect(FILL_CARD_KEY).not.toMatch(/^(?:k[1-9][0-9]*|c:[a-zA-Z0-9_-]{1,64})$/);
    expect(filled.input.patterns).toEqual(original.input.patterns);
    expect(filled.input.effects).toEqual(original.input.effects);
    expect(filled.input.effects[0].card).toBe(1);
    const pattern = filled.input.patterns[0];
    const members = [
      ...pattern.slots.map(slot => slot.members),
      ...pattern.slots.flatMap(slot => slot.distinctGroups ?? []),
      ...pattern.conditions.map(condition => condition.members),
      ...filled.input.effects.flatMap(effect => effect.steps.flatMap(step =>
        'members' in step && step.members !== null ? [step.members] : [])),
    ];
    expect(pattern.slots[1].distinctGroups).toEqual([[0, 1], [2]]);
    expect(members).toHaveLength(11);
    for (const group of members) {
      expect(group).not.toContain(fillerIndex);
      expect(group.every(index => index >= 0 && index < fillerIndex)).toBe(true);
    }
    expect(filled.input.effects[0].steps[3]).toEqual({ kind: 'excavate', count: 1, members: null });
  });

  it('対象なしのめくる手順で、補充分しかめくらない1試行でも手札が増える', () => {
    const deck = createCalculationDeck([1, 1]);
    deck.mainFillTarget = 40;
    deck.effects = [createCalculationEffect([
      { kind: 'excavate', count: 1, target: null },
      { kind: 'excavate', count: 1, target: null },
    ])];
    const calculation = compileCalculationDeck(deck, [1]);
    if (calculation.mode !== 'simulation') throw new Error('方式不一致');
    const originalApply = simulationSteps.applySimulationEffect;
    const hands: number[][] = [];
    vi.spyOn(simulationSteps, 'applySimulationEffect').mockImplementation((...args) => {
      originalApply(...args);
      hands.push([...args[1].hand]);
    });
    // 効果カード、補充38枚、最後に初動カード。補充だけを2回めくる。
    const order = [1, ...Array.from({ length: 38 }, () => 2), 0];
    expect(runTrial(calculation.input, order, 1, () => () => 0.5))
      .toEqual({ overall: false, perPattern: [false] });
    // 全体と単独の両目標で、初手1枚から補充カード2枚の手札へ増える。
    expect(hands).toEqual([[0, 0, 2], [0, 0, 2]]);
  });
});
