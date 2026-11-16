import { describe, expect, it } from 'vitest';
import type { CardData, Deck, Result } from '../src/domain/types';
import { compile } from '../src/engine/compile';
import { compileCalculation } from '../src/engine/compileCalculation';
import { prepareCompilation } from '../src/engine/compilePreparation';
import { countStates } from '../src/engine/exact';
import { runCalculation, runEngine } from '../src/engine/run';
import type { EngineLimits } from '../src/engine/types';
import { stableInputKey } from '../src/ui/patterns/CalculationProvider';
import {
  createCalculationDeck, resolveCalculationCard,
} from './fixtures/calculationDeck';

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function createDeck(): Deck {
  const deck = createCalculationDeck([3, 3, 2, 27]);
  deck.effects = [];
  deck.groups = [{
    id: 'starter', name: 'A/B', include: [], exclude: [],
    filter: { op: 'pred', pred: { kind: 'cards', cardIds: ['k1', 'k2'] } },
  }];
  deck.patterns.push({
    id: 'distinct', name: '種類違いと残り', enabled: true,
    slots: [{ id: 'distinct-slot', source: { type: 'group', groupId: 'starter' }, count: 2, distinctNames: true }],
    conditions: [{ kind: 'deckAtLeast', target: { type: 'card', cardId: 'k3' }, count: 1 }],
  }, {
    id: 'overlap', name: '重なるスロット', enabled: true, conditions: [],
    slots: [
      { id: 'overlap-group', source: { type: 'group', groupId: 'starter' }, count: 1, distinctNames: false },
      { id: 'overlap-card', source: { type: 'card', cardId: 'k2' }, count: 1, distinctNames: false },
    ],
  });
  return deck;
}

function addUnrelatedCards(deck: Deck): Deck {
  const copy = structuredClone(deck);
  const card: CardData = {
    id: 'c:unrelated', name: '無関係', custom: true,
    kind: 'trap', monsterTypes: [], text: '',
  };
  copy.customCards.push(card);
  copy.entries.push({ cardId: card.id, name: card.name, count: 5, section: 'main' });
  return copy;
}

function calculate(deck: Deck, limits?: Partial<EngineLimits>) {
  const resolveCard = (id: string) =>
    deck.customCards.find(card => card.id === id) ?? resolveCalculationCard(id);
  return value(compileCalculation(deck, resolveCard, [5, 6], limits));
}

function combinations(population: number, selected: number): number {
  let result = 1;
  for (let i = 1; i <= selected; i++) result = result * (population - i + 1) / i;
  return result;
}

describe('補充した計算と実際に無関係カードを加えた計算', () => {
  it.each([2_000_000, 0])('classes の上限 %s で全体・単独・5枚・6枚が完全一致する', exactMaxStates => {
    const deck = createDeck();
    const limits = { exactMaxStates, samples: 20_000, seed: 123456 };
    const filled = calculate({ ...deck, mainFillTarget: 40 }, limits);
    const actual = calculate(addUnrelatedCards(deck), limits);
    expect(filled).toEqual(actual);
    const results = runCalculation(filled).map(({ elapsedMs: _, ...result }) => result);
    expect(results).toEqual(runCalculation(actual).map(({ elapsedMs: _, ...result }) => result));
    for (const result of results) {
      for (const estimate of [result.success, ...Object.values(result.perPattern)]) {
        expect(estimate.method).toBe(exactMaxStates === 0 ? 'sampling' : 'exact');
      }
    }
    expect(value(compile({ ...deck, mainFillTarget: 40 }, resolveCalculationCard, [5, 6], limits)))
      .toEqual(filled.input);
  });

  it('1枚ドローのシミュレーションも全体・単独・5枚・6枚が許容差内になる', () => {
    const deck = createCalculationDeck([3, 3, 29]);
    const limits = { samples: 30_000, seed: 123456 };
    const filled = calculate({ ...deck, mainFillTarget: 40 }, limits);
    const actual = calculate(addUnrelatedCards(deck), limits);
    expect(filled.mode).toBe('simulation');
    const results = runCalculation(filled);
    const expected = runCalculation(actual);
    for (let i = 0; i < results.length; i++) {
      expect(Math.abs(results[i].success.p - expected[i].success.p)).toBeLessThanOrEqual(0.01);
      for (const [id, estimate] of Object.entries(results[i].perPattern)) {
        expect(Math.abs(estimate.p - expected[i].perPattern[id].p)).toBeLessThanOrEqual(0.01);
      }
    }
  });

  it.each([undefined, 40])('A3枚と無関係32枚、T=%s の独立した式に一致する', mainFillTarget => {
    const deck = createCalculationDeck([3, 32]);
    deck.effects = [];
    if (mainFillTarget !== undefined) deck.mainFillTarget = mainFillTarget;
    const input = value(compile(deck, resolveCalculationCard, [5]));
    const population = mainFillTarget ?? 35;
    const expected = 1 - combinations(population - 3, 5) / combinations(population, 5);
    const [result] = runEngine(input);
    expect(result.success.p).toBeCloseTo(expected, 12);
    expect(result.perPattern.P.p).toBeCloseTo(expected, 12);
  });
});

describe('補充の有無と計算入力の境界', () => {
  it.each([false, true])('simulation=%s: M≧T の入力は設定なしと完全に同じ', isSimulation => {
    for (const mainCount of [40, 50, 60]) {
      const deck = createCalculationDeck([3, 3, mainCount - 6]);
      if (!isSimulation) deck.effects = [];
      const original = calculate(deck);
      expect(calculate({ ...deck, mainFillTarget: 40 })).toEqual(original);
      expect(calculate({ ...deck, mainFillTarget: mainCount })).toEqual(original);
    }
  });

  it('counts には補充分を入れず、extra・side は実枚数にも含めない', () => {
    const deck = createDeck();
    deck.entries.push(
      { cardId: 'k5', name: 'EX', count: 15, section: 'extra' },
      { cardId: 'k6', name: 'サイド', count: 15, section: 'side' },
    );
    const original = value(prepareCompilation(deck, [5, 6]));
    const filled = value(prepareCompilation({ ...deck, mainFillTarget: 40 }, [5, 6]));
    expect(filled.counts).toEqual(original.counts);
    expect([...filled.counts.values()].reduce((sum, count) => sum + count, 0)).toBe(35);
    expect(filled.fillCount).toBe(5);
    expect(filled.deckSize).toBe(40);
  });

  it.each([false, true])('simulation=%s: M=3 を40枚に補うと5枚・6枚を計算できる', isSimulation => {
    const deck = createCalculationDeck([1, 1, 1]);
    if (!isSimulation) deck.effects = [];
    expect(compileCalculation(deck, resolveCalculationCard, [5, 6]).ok).toBe(false);
    const filled = calculate({ ...deck, mainFillTarget: 40 }, { samples: 100 });
    expect(runCalculation(filled).map(result => result.handSize)).toEqual([5, 6]);
    if (!isSimulation) expect(compile({ ...deck, mainFillTarget: 40 }, resolveCalculationCard, [5, 6]).ok).toBe(true);
  });

  it('M=61 は設定があっても両コンパイラが拒否する', () => {
    const deck = createCalculationDeck([3, 3, 55]);
    deck.effects = [];
    deck.mainFillTarget = 60;
    for (const compileDeck of [compile, compileCalculation]) {
      const result = compileDeck(deck, resolveCalculationCard, [5, 6]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('60 枚を超えている');
    }
  });

  it.each([false, true])('simulation=%s: 古さのキーは実際の計算入力の変化だけに反応する', isSimulation => {
    const deck = createCalculationDeck([3, 3, 29]);
    if (!isSimulation) deck.effects = [];
    expect(stableInputKey(calculate({ ...deck, mainFillTarget: 40 })))
      .not.toBe(stableInputKey(calculate({ ...deck, mainFillTarget: 45 })));
    deck.entries[2].count = 44;
    expect(stableInputKey(calculate(deck)))
      .toBe(stableInputKey(calculate({ ...deck, mainFillTarget: 40 })));
  });

  it('35単独クラスの手札6枚は5枚の補充で200万状態の境界を超える', () => {
    const deck = createCalculationDeck(Array.from({ length: 35 }, () => 1));
    deck.effects = [];
    deck.groups[0].filter = { op: 'and', children: [] };
    deck.patterns[0].slots[0].distinctNames = true;
    deck.patterns[0].slots[0].count = 2;
    const original = value(compile(deck, resolveCalculationCard, [6]));
    const filled = value(compile({ ...deck, mainFillTarget: 40 }, resolveCalculationCard, [6]));
    expect(countStates(original, 6)).toBe(1_623_160);
    expect(countStates(filled, 6)).toBe(2_007_327);
    expect(runEngine(original)[0].success.method).toBe('exact');
    expect(runEngine(filled)[0].success.method).toBe('sampling');
    console.log('補充の状態数: 1,623,160（厳密）→ 2,007,327（サンプリング）');
  }, 15_000);
});
