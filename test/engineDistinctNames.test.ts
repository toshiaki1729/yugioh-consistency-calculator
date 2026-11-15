import { describe, expect, it } from 'vitest';
import { getCardNameKey } from '../src/domain/ruleNames';
import type { CardData, Deck } from '../src/domain/types';
import { compile } from '../src/engine/compile';
import { compileCalculation } from '../src/engine/compileCalculation';
import { compileSimulation } from '../src/engine/compileSimulation';
import { countStates, runExact } from '../src/engine/exact';
import { createHandMatcher } from '../src/engine/flow';
import { project } from '../src/engine/project';
import { runEngine } from '../src/engine/run';
import { runTrial } from '../src/engine/simulate';
import { runSimulation } from '../src/engine/simulateRun';
import { DEFAULT_LIMITS } from '../src/engine/types';
import { stableInputKey } from '../src/ui/patterns/CalculationProvider';
import { enumerateNameHands, makeNameDeck, nameCards, nameGroup, namePattern, nameSlot } from './fixtures/distinctNamesDeck';

const resolveCard = (id: string) => nameCards.find(card => card.id === id);
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let value = 1;
  for (let i = 1; i <= k; i++) value = value * (n - i + 1) / i;
  return Math.round(value);
}
function compileDeck(deck: Deck, resolve = resolveCard) {
  const result = compile(deck, resolve, [5]);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function compileSimulationDeck(deck: Deck, resolve = resolveCard) {
  const counts = new Map<string, number>();
  for (const entry of deck.entries) {
    if (entry.section === 'main') counts.set(entry.cardId, (counts.get(entry.cardId) ?? 0) + entry.count);
  }
  return { ...compileSimulation(deck, counts, deck.patterns, resolve), handSizes: [5], limits: { ...DEFAULT_LIMITS } };
}

describe('名前のキーと入力の互換性', () => {
  it('ルール上の最初の名前、カード名、保存名の順でNFKC・空白除去・小文字化する', () => {
    const card: CardData = { ...nameCards[0], name: ' Ａ ｂ ', text: '' };
    expect(getCardNameKey(undefined, ' Ａ ｂ ')).toBe('ab');
    expect(getCardNameKey(card, '保存名')).toBe('ab');
    expect(getCardNameKey({ ...card, text: 'このカード名はルール上「 Ｘ Ｙ 」として扱う。このカードのカード名は「Z」として扱う。' }, '保存名')).toBe('xy');
    expect(getCardNameKey({ ...card, name: 'カ・ナ' }, '')).not.toBe(getCardNameKey(undefined, 'か・な'));
  });

  it('同名の別CardIdも1種類にまとめる', () => {
    const deck = makeNameDeck({ k4370: 3, k19092: 3, O: 34 });
    deck.groups[0].include = ['k4370', 'k19092'];
    const resolve = (id: string): CardData => ({ ...nameCards[0], id, name: 'カオス・ソルジャー' });
    const input = compileDeck(deck, resolve);
    expect(input.patterns[0].slots[0].distinctGroups).toEqual([[0, 1]]);
    expect(runExact(input, 5).estimate.p).toBe(0);
    expect(compileSimulationDeck(deck, resolve).patterns[0].slots[0].distinctGroups).toEqual([[0, 1]]);
  });

  it('名前が重ならないときは従来の入力・状態数・確率を保つ', () => {
    const deck = makeNameDeck({ A: 3, B: 3, O: 34 });
    const input = compileDeck(deck);
    expect(input.classes).toEqual([{ key: 'card:A', count: 3 }, { key: 'card:B', count: 3 }]);
    expect(input.patterns).toEqual([{ id: 'P', slots: [{ count: 2, distinct: true, members: [0, 1] }], conditions: [] }]);
    expect(input.otherCount).toBe(34);
    expect(countStates(input, 5)).toBe(15);
    expect(runExact(input, 5).estimate.p).toBeCloseTo((choose(40, 5) - 2 * choose(37, 5) + choose(34, 5)) / choose(40, 5), 12);
    expect(compileSimulationDeck(deck).patterns[0].slots).toEqual(input.patterns[0].slots);
  });

  it('種類違いを使わない入力は名前を変えても変わらない', () => {
    const deck = makeNameDeck();
    deck.patterns[0].slots[0].distinctNames = false;
    const uniqueNames = (id: string) => ({ ...resolveCard(id)!, text: '' });
    const input = compileDeck(deck);
    expect(input).toEqual(compileDeck(deck, uniqueNames));
    expect(compileSimulationDeck(deck)).toEqual(compileSimulationDeck(deck, uniqueNames));
    expect(countStates(input, 5)).toBe(6);
    expect(runExact(input, 5).estimate.p).toBeCloseTo(1 - (choose(31, 5) + 9 * choose(31, 4)) / choose(40, 5), 12);
  });

  it('未取得時は最初のメインの保存名を使い、DB読込後は古い結果の判定キーが変わる', () => {
    const deck = makeNameDeck();
    deck.entries.unshift({ cardId: 'W', name: 'A', count: 1, section: 'extra' });
    const before = compileDeck(deck, () => undefined);
    const after = compileDeck(deck);
    expect(before.patterns[0].slots[0]).not.toHaveProperty('distinctGroups');
    expect(after.patterns[0].slots[0].distinctGroups).toEqual([[0, 1], [2]]);
    expect(stableInputKey({ mode: 'classes', input: before })).not.toBe(stableInputKey({ mode: 'classes', input: after }));
    const simulationBefore = compileSimulationDeck(deck, () => undefined);
    expect(simulationBefore.patterns[0].slots[0]).not.toHaveProperty('distinctGroups');
    expect(stableInputKey({ mode: 'simulation', input: simulationBefore })).not.toBe(stableInputKey({ mode: 'simulation', input: compileSimulationDeck(deck) }));
    deck.entries.find(entry => entry.section === 'main' && entry.cardId === 'W')!.name = ' Ａ ';
    deck.entries.push({ cardId: 'W', name: '別の保存名', count: 1, section: 'main' });
    deck.entries.find(entry => entry.cardId === 'O')!.count--;
    expect(compileDeck(deck, () => undefined).patterns[0].slots[0].distinctGroups).toEqual([[0, 1], [2]]);
    expect(compileSimulationDeck(deck, () => undefined).patterns[0].slots[0].distinctGroups).toEqual([[0, 1], [2]]);
  });
});

describe('同名の種類違いを各方式で計算する', () => {
  it.each([false, true])('A3枚・W3枚に別名Bを加える=%s: 式との一致', hasOtherName => {
    const deck = hasOtherName ? makeNameDeck() : makeNameDeck({ A: 3, W: 3, O: 34 });
    const expected = hasOtherName
      ? (choose(40, 5) - choose(34, 5) - choose(37, 5) + choose(31, 5)) / choose(40, 5) : 0;
    const input = compileDeck(deck);
    const exact = runEngine(input)[0];
    const sampled = runEngine({ ...input, limits: { ...input.limits, exactMaxStates: 0 } })[0];
    const simulated = runSimulation(compileSimulationDeck(deck), 5);
    for (const estimate of [exact.success, exact.perPattern.P]) expect(Math.abs(estimate.p - expected)).toBeLessThanOrEqual(1e-12);
    for (const result of [sampled, simulated]) {
      for (const estimate of [result.success, result.perPattern.P]) expect(Math.abs(estimate.p - expected)).toBeLessThanOrEqual(0.01);
    }
    if (!hasOtherName) expect([sampled.success.p, simulated.success.p]).toEqual([0, 0]);
  });

  it('特定のカードは同名の別カードを数えない', () => {
    const deck = makeNameDeck();
    deck.patterns[0].slots = [{ id: 'A', source: { type: 'card', cardId: 'A' }, count: 1, distinctNames: false }];
    expect(runExact(compileDeck(deck), 5).estimate.p).toBeCloseTo(1 - choose(37, 5) / choose(40, 5), 12);
  });

  it('名前のノードをスロット間で共有せず所属外クラスにも流さない', () => {
    const match = createHandMatcher([{ id: 'P', conditions: [], slots: [
      { count: 2, distinct: true, members: [0, 2], distinctGroups: [[0], [2]] },
      { count: 2, distinct: true, members: [1, 2], distinctGroups: [[1], [2]] },
      { count: 1, distinct: false, members: [0] },
    ] }], 5);
    expect(match(Uint8Array.from([1, 2, 2]))).toBe(false);
    expect(match(Uint8Array.from([2, 1, 2]))).toBe(true);
    const grouped = createHandMatcher([{ id: 'P', conditions: [], slots: [
      { count: 2, distinct: true, members: [0, 3, 2], distinctGroups: [[0, 3], [2]] },
      { count: 2, distinct: true, members: [1, 3, 2], distinctGroups: [[1, 3], [2]] },
      { count: 1, distinct: false, members: [0] },
    ] }], 5);
    expect(grouped(Uint8Array.from([1, 2, 2, 0]))).toBe(false);
    expect(grouped(Uint8Array.from([2, 1, 2, 0]))).toBe(true);
    expect(grouped(Uint8Array.from([2, 0, 2, 1]))).toBe(true);
    expect(grouped(Uint8Array.from([1, 2, 2, 0]))).toBe(false);
  });

  it('名前の事前容量不足を複数スロットでも拒否する', () => {
    const match = createHandMatcher([{ id: 'P', conditions: [], slots: [
      { count: 2, distinct: true, members: [0, 1, 2], distinctGroups: [[0, 1], [2]] },
      { count: 1, distinct: false, members: [3] },
    ] }], 5);
    expect(match(Uint8Array.from([2, 2, 0, 1]))).toBe(false);
    expect(match(Uint8Array.from([2, 1, 1, 1]))).toBe(true);
  });

  it.each(['search', 'excavate'] as const)('%sは既にある同名Wより、初動を完成させる別名Bを選ぶ', kind => {
    const deck = makeNameDeck({ A: 1, W: 1, B: 1, E: 1, O: 2 });
    const target = { type: 'group', groupId: 'AWB' } as const;
    deck.effects = [{ id: 'effect', cardId: 'E', oncePerTurn: true, firstOnly: false, drawLock: 'none',
      steps: [kind === 'search' ? { kind, target } : { kind, target, count: 2 }] }];
    const compiled = compileCalculation(deck, resolveCard, [2]);
    if (!compiled.ok || compiled.value.mode !== 'simulation') throw new Error('シミュレーション入力が必要');
    expect(runTrial(compiled.value.input, [0, 3, 1, 2, 4, 4], 2, () => () => 0.5))
      .toEqual({ overall: true, perPattern: [true] });
  });
});

describe('独立した物理カードの割り当て全探索', () => {
  const deck = makeNameDeck({ O: 2, A: 2, W: 2, B: 2, C: 2, E: 2 });
  deck.groups.push(nameGroup('AB', ['A', 'B']), nameGroup('WBC', ['W', 'B', 'C']), nameGroup('AW', ['A', 'W']));
  deck.patterns = [
    namePattern('extraClass', [{ id: 'O', source: { type: 'card', cardId: 'O' }, count: 2, distinctNames: false }]),
    namePattern('mixed', [nameSlot('AWB'), nameSlot('AW', 1, false)]),
    namePattern('overlap', [nameSlot('AWB'), nameSlot('WBC')]),
    namePattern('differentMembership', [nameSlot('AB'), nameSlot('WBC', 1, false)]),
  ];
  deck.patterns[1].conditions = [{ kind: 'deckAtLeast', target: { type: 'card', cardId: 'W' }, count: 1 }];
  deck.patterns[2].conditions = [{ kind: 'deckAtLeast', target: { type: 'group', groupId: 'AB' }, count: 1 }];
  const reference = enumerateNameHands(deck, 5, { A: 'alpha', W: 'alpha', B: 'beta', C: 'gamma', O: 'other', E: 'effect' });

  it('N=12,h=5の792通りで、条件と所属が異なる同名カードを区別して計算する', () => {
    expect(reference.total).toBe(792);
    const input = compileDeck(deck);
    const exact = runEngine(input)[0];
    expect(exact.success.p).toBeCloseTo(reference.p, 12);
    for (const pattern of deck.patterns) expect(exact.perPattern[pattern.id].p).toBeCloseTo(reference.perPattern[pattern.id], 12);
    const sampled = runEngine({ ...input, limits: { ...input.limits, exactMaxStates: 0 } })[0];
    const simulated = runSimulation(compileSimulationDeck(deck), 5);
    for (const result of [sampled, simulated]) {
      expect(Math.abs(result.success.p - reference.p)).toBeLessThanOrEqual(0.01);
      for (const pattern of deck.patterns) expect(Math.abs(result.perPattern[pattern.id].p - reference.perPattern[pattern.id])).toBeLessThanOrEqual(0.01);
    }
  });

  it('射影で名前グループの番号を作り直し、単独compileと一致する', () => {
    const input = compileDeck(deck);
    const snapshot = JSON.stringify(input);
    expect(input.patterns[1].slots[0].distinctGroups).toEqual([[1, 2], [3]]);
    for (const pattern of input.patterns) {
      const projected = project(input, pattern);
      const single = compileDeck({ ...deck, patterns: deck.patterns.filter(candidate => candidate.id === pattern.id) });
      expect(projected.patterns).toEqual(single.patterns);
      expect(projected.classes.map(group => group.count)).toEqual(single.classes.map(group => group.count));
      expect(projected.otherCount).toBe(single.otherCount);
      expect(countStates(projected, 5)).toBe(countStates(single, 5));
      expect(runExact(projected, 5).estimate).toEqual(runExact(single, 5).estimate);
      expect(runExact(projected, 5).estimate.p).toBeCloseTo(reference.perPattern[pattern.id], 12);
    }
    expect(project(input, input.patterns[1]).patterns[0].slots[0].distinctGroups).toEqual([[0, 1], [2]]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
