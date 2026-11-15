import { describe, expect, it } from 'vitest';
import type {
  CardGroup, CardTarget, Deck, Pattern, PatternCondition, Slot,
} from '../src/domain/types';
import { compile } from '../src/engine/compile';
import { compileClassPatterns } from '../src/engine/compileClassPatterns';
import { countStates, runExact } from '../src/engine/exact';
import { createHandMatcher } from '../src/engine/flow';
import { project } from '../src/engine/project';
import { runEngine } from '../src/engine/run';
import { DEFAULT_LIMITS } from '../src/engine/types';
import type { EngineInput, EngineLimits } from '../src/engine/types';
import { createEffect } from './fixtures/effectsDeck';

function choose(population: number, selected: number) {
  if (selected < 0 || selected > population) return 0;
  let value = 1;
  for (let i = 1; i <= selected; i++) value = value * (population - i + 1) / i;
  return Math.round(value);
}

const card = (cardId: string): CardTarget => ({ type: 'card', cardId });
const group = (groupId: string): CardTarget => ({ type: 'group', groupId });
const remaining = (target: CardTarget, count = 1): PatternCondition => ({
  kind: 'deckAtLeast', target, count,
});
const slot = (source: CardTarget, count = 1, distinctNames = false): Slot => ({
  id: 's', source, count, distinctNames,
});
const pattern = (id: string, slots: Slot[], conditions: PatternCondition[]): Pattern => ({
  id, name: id, enabled: true,
  slots: slots.map((item, i) => ({ ...item, id: `${id}:${i}` })), conditions,
});

function makeDeck(
  counts: Record<string, number>, patterns: Pattern[], groups: CardGroup[] = [],
): Deck {
  return {
    id: 'd', name: '条件のテスト', updatedAt: 0, pageData: {}, effects: [], groups, patterns,
    entries: Object.entries(counts).map(([cardId, count]) => ({
      cardId, count, name: cardId, section: 'main',
    })),
    customCards: Object.keys(counts).map(id => ({
      id, name: id, kind: 'monster', monsterTypes: [], text: '',
    })),
  };
}

function inputFor(deck: Deck, limits?: Partial<EngineLimits>) {
  const cards = new Map(deck.customCards.map(item => [item.id, item]));
  const compiled = compile(deck, id => cards.get(id), [5], limits);
  if (!compiled.ok) throw new Error(compiled.error);
  return compiled.value;
}

describe('デッキの残数条件', () => {
  it.each([2_000_000, 0])('A3枚・I1枚を二項係数の式と比較する（上限%d）', exactMaxStates => {
    const deck = makeDeck({ A: 3, I: 1, O: 36 }, [
      pattern('P', [slot(card('A'))], [remaining(card('I'))]),
    ]);
    const input = inputFor(deck, { exactMaxStates });
    const expected = (choose(39, 5) - choose(36, 5)) / choose(40, 5);
    const result = runEngine(input)[0];
    for (const estimate of [result.success, result.perPattern.P]) {
      expect(estimate.method).toBe(exactMaxStates === 0 ? 'sampling' : 'exact');
      expect(Math.abs(estimate.p - expected)).toBeLessThanOrEqual(exactMaxStates === 0 ? 0.01 : 1e-12);
    }
    expect(runExact(input, 5).weightSum).toBe(choose(40, 5));
    expect(input.classes.map(item => item.key)).toEqual(['slots:0', 'slots:|conds:0']);
    expect(input.otherCount).toBe(36);
  });

  const groups: CardGroup[] = Object.entries({
    AB: ['A', 'B'], AC: ['A', 'C'], BC: ['B', 'C'], CD: ['C', 'D'],
  }).map(([id, cardIds]) => ({
    id, name: id, filter: { op: 'pred', pred: { kind: 'cards', cardIds } }, include: [], exclude: [],
  }));
  const deck = makeDeck({ A: 3, B: 2, C: 2, D: 1, O: 4 }, [
    pattern('split', [slot(group('AB'))], [remaining(card('A'), 2)]),
    pattern('conditionCard', [slot(group('AB'))], [remaining(card('C'), 2)]),
    pattern('overlap', [slot(group('AB'))], [remaining(group('AC'), 3), remaining(group('BC'), 2)]),
    pattern('only', [], [remaining(group('CD'), 2)]),
    pattern('same', [slot(card('A'))], [remaining(card('A'), 2)]),
    pattern('distinct', [slot(group('AB'), 2, true), slot(card('A'))], [remaining(card('C'))]),
    pattern('missing', [], [remaining(card('missing'))]),
    pattern('tooMany', [], [remaining(card('A'), 4)]),
  ], groups);

  // 物理カードの組み合わせを列挙し、このデッキの成立条件を直接数える。
  const physical = deck.entries.flatMap(entry => Array<string>(entry.count).fill(entry.cardId));
  const successes = Object.fromEntries(deck.patterns.map(item => [item.id, 0]));
  let total = 0;
  let anySuccesses = 0;
  function enumerate(hand: number[], start: number) {
    if (hand.length < 5) {
      for (let i = start; i <= physical.length - (5 - hand.length); i++) enumerate([...hand, i], i + 1);
      return;
    }
    const drawn = (id: string) => hand.filter(index => physical[index] === id).length;
    const a = drawn('A'), b = drawn('B'), c = drawn('C'), d = drawn('D');
    const outcomes: Record<string, boolean> = {
      split: a + b >= 1 && 3 - a >= 2,
      conditionCard: a + b >= 1 && 2 - c >= 2,
      overlap: a + b >= 1 && 5 - a - c >= 3 && 4 - b - c >= 2,
      only: 3 - c - d >= 2,
      same: a >= 1 && 3 - a >= 2,
      distinct: a >= 2 && b >= 1 && 2 - c >= 1,
      missing: false,
      tooMany: false,
    };
    total++;
    if (Object.values(outcomes).some(Boolean)) anySuccesses++;
    for (const [id, isSuccess] of Object.entries(outcomes)) successes[id] += Number(isSuccess);
  }
  enumerate([], 0);

  it.each([2_000_000, 0])('N12・h5の全792通りと全体・単独を比較する（上限%d）', exactMaxStates => {
    expect(total).toBe(choose(12, 5));
    expect(total).toBe(792);
    const input = inputFor(deck, { exactMaxStates });
    const snapshot = JSON.stringify(input);
    const result = runEngine(input)[0];
    const tolerance = exactMaxStates === 0 ? 0.01 : 1e-12;
    expect(Math.abs(result.success.p - anySuccesses / total)).toBeLessThanOrEqual(tolerance);
    expect(result.success.p).toBeGreaterThan(0);
    expect(result.success.p).toBeLessThan(1);
    for (const item of deck.patterns) {
      expect(Math.abs(result.perPattern[item.id].p - successes[item.id] / total)).toBeLessThanOrEqual(tolerance);
      expect(result.perPattern[item.id].method).toBe(exactMaxStates === 0 ? 'sampling' : 'exact');
      const single = inputFor({ ...deck, patterns: [item] });
      expect(Math.abs(runExact(single, 5).estimate.p - successes[item.id] / total)).toBeLessThanOrEqual(1e-12);
      const projected = project(input, input.patterns.find(candidate => candidate.id === item.id)!);
      expect(runExact(projected, 5).weightSum).toBe(total);
    }
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('射影で条件の所属だけが違うクラスを保ち、無関係なクラスをotherに戻す', () => {
    const input = inputFor(deck);
    const split = project(input, input.patterns[0]);
    expect(split.classes).toEqual([
      { key: 'slots:0|conds:0', count: 3 }, { key: 'slots:0', count: 2 },
    ]);
    expect(split.otherCount).toBe(7);
    expect(split.patterns[0].conditions).toEqual([{ minRemaining: 2, members: [0] }]);
    const only = project(input, input.patterns[3]);
    expect(only.classes).toEqual([{ key: 'slots:|conds:0', count: 3 }]);
    expect(only.otherCount).toBe(9);
    expect(only.patterns[0].conditions).toEqual([{ minRemaining: 2, members: [0] }]);
  });

  it('未取得カードの条件所属もinclude・excludeを尊重し、条件式を評価しない', () => {
    const unknown = makeDeck({ A: 3, B: 2, C: 7 }, [
      pattern('P', [], [remaining(group('G'), 2)]),
    ], [{
      id: 'G', name: 'G', filter: { op: 'not', child: { op: 'or', children: [] } },
      include: ['A', 'B'], exclude: ['B'],
    }]);
    const result = compile(unknown, () => undefined, [5]);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.classes).toEqual([{ key: 'slots:|conds:0', count: 3 }]);
    expect(result.value.otherCount).toBe(9);
    expect(runEngine(result.value)[0].success.p)
      .toBeCloseTo((choose(9, 5) + 3 * choose(9, 4)) / choose(12, 5), 12);
  });

  it('手札の変化ごとに残数を判定し、条件不成立ならスロット成立でも拒否する', () => {
    const matches = createHandMatcher([{
      id: 'P', slots: [{ count: 1, distinct: false, members: [0] }],
      conditions: [{ members: [0, 1], minRemaining: 2 }],
    }], 5, [2, 2]);
    expect(matches(Uint8Array.from([1, 1]))).toBe(true);
    expect(matches(Uint8Array.from([1, 2]))).toBe(false);
    expect(matches(Uint8Array.from([0, 0]))).toBe(false);
    expect(matches(Uint8Array.from([2, 0]))).toBe(true);
  });

  it('条件がない場合は従来のキー・状態数・確率を維持する', () => {
    const input = inputFor(makeDeck({ A: 3, B: 2, O: 7 }, [
      pattern('P', [slot(group('AB'))], []),
    ], groups));
    expect(input.classes).toEqual([{ key: 'slots:0', count: 5 }]);
    expect(input.otherCount).toBe(7);
    expect(countStates(input, 5)).toBe(6);
    expect(runEngine(input)[0].success).toEqual({
      p: 1 - choose(7, 5) / choose(12, 5), method: 'exact', states: 6,
    });
  });
});

describe('途中段階の保護と保護解除後の移動条件', () => {
  const unsupported: PatternCondition[] = [
    { kind: 'movedIncludes', target: card('A'), zones: ['graveyard'] },
    { kind: 'movedExcludes', target: card('A'), zones: ['banishedFaceUp'] },
    { kind: 'deckAfterBanish', target: card('A'), banish: 3, count: 1 },
  ];
  const protectedError = { ok: false, error: 'ドロー効果と一部の条件はまだ計算できません' };

  it.each(unsupported)('有効な条件だけのパターンも保護する: $kind', condition => {
    const deck = makeDeck({ A: 3, O: 9 }, [pattern('P', [], [condition])]);
    expect(compile(deck, () => undefined, [5])).toEqual(protectedError);
    deck.patterns[0].enabled = false;
    deck.patterns.push(pattern('valid', [slot(card('A'))], []));
    expect(compile(deck, () => undefined, [5]).ok).toBe(true);
  });

  it('メインデッキのドロー効果を保護し、無効パターンの有無に依存しない', () => {
    const deck = makeDeck({ A: 3, O: 9 }, [pattern('P', [slot(card('A'))], [])]);
    deck.effects = [{ ...createEffect(), cardId: 'A' }];
    expect(compile(deck, () => undefined, [5])).toEqual(protectedError);
    deck.patterns = [];
    expect(compile(deck, () => undefined, [5])).toEqual(protectedError);
  });

  it.each(['extra', 'side', 'absent'] as const)('メインに無いカードの効果は保護しない: %s', section => {
    const deck = makeDeck({ A: 3, O: 9 }, [pattern('P', [slot(card('A'))], [])]);
    deck.effects = [createEffect()];
    if (section !== 'absent') deck.entries.push({ cardId: 'k1', name: '効果', count: 3, section });
    expect(compile(deck, () => undefined, [5]).ok).toBe(true);
  });

  // 公開compileの保護は維持したまま、T27で利用する変換と結果の組み立てを検証する。
  function compileWithoutGuard(patterns: Pattern[], exactMaxStates = 0): EngineInput {
    const deck = makeDeck({ A: 3, B: 2, O: 7 }, patterns);
    const counts = new Map(deck.entries.map(entry => [entry.cardId, entry.count]));
    return {
      deckSize: 12, handSizes: [5], limits: { ...DEFAULT_LIMITS, exactMaxStates },
      ...compileClassPatterns(deck, counts, patterns, () => undefined),
    };
  }

  it('movedIncludesはクラス分けと計算から除き、単独の結果に厳密値0を入れる', () => {
    const input = compileWithoutGuard([
      pattern('valid', [slot(card('A'))], []),
      pattern('never', [slot(card('B'), 2, true)], [unsupported[0], remaining(card('O'))]),
    ]);
    expect(input.patterns.map(item => item.id)).toEqual(['valid']);
    expect(input.impossiblePatternIds).toEqual(['never']);
    expect(input.classes).toEqual([{ key: 'slots:0', count: 3 }]);
    const updates: number[][] = [];
    const result = runEngine(input, (done, total) => updates.push([done, total]))[0];
    expect(result.perPattern.never).toEqual({ p: 0, method: 'exact', states: 0 });
    expect(result.perPattern.valid.method).toBe('sampling');
    expect(Math.abs(result.success.p - (1 - choose(9, 5) / choose(12, 5)))).toBeLessThanOrEqual(0.01);
    expect(updates.at(-1)).toEqual([2 * DEFAULT_LIMITS.samples, 2 * DEFAULT_LIMITS.samples]);
    expect(project(input, input.patterns[0]).impossiblePatternIds).toEqual([]);
  });

  it('movedIncludesだけなら全体と単独が厳密値0になり、列挙しない', () => {
    const input = compileWithoutGuard([pattern('__proto__', [], [unsupported[0]])]);
    const updates: number[][] = [];
    const result = runEngine(input, (done, total) => updates.push([done, total]))[0];
    expect(result.success).toEqual({ p: 0, method: 'exact', states: 0 });
    expect(Object.hasOwn(result.perPattern, '__proto__')).toBe(true);
    expect(result.perPattern.__proto__).toEqual(result.success);
    expect(updates).toEqual([[0, 0]]);
  });

  it('movedExcludesを除き、条件がすべて消えたパターンは常に成立する', () => {
    const input = compileWithoutGuard([
      pattern('always', [], [unsupported[1]]),
      pattern('remaining', [], [unsupported[1], remaining(card('A'), 2)]),
    ], DEFAULT_LIMITS.exactMaxStates);
    expect(input.patterns[0]).toEqual({ id: 'always', slots: [], conditions: [] });
    const result = runEngine(input)[0];
    expect(result.success.p).toBe(1);
    expect(result.perPattern.always.p).toBe(1);
    expect(result.perPattern.remaining.p)
      .toBeCloseTo((choose(9, 5) + 3 * choose(9, 4)) / choose(12, 5), 12);
  });
});
