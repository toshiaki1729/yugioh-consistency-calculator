import { describe, expect, it } from 'vitest';
import type { CardData, CardGroup, Deck, Pattern, Slot } from '../src/domain/types';
import { compile } from '../src/engine/compile';
import { binomial, countStates, runExact } from '../src/engine/exact';
import { createHandMatcher } from '../src/engine/flow';
import { project } from '../src/engine/project';
import { runEngine } from '../src/engine/run';
import { runSampling } from '../src/engine/sampling';
import { DEFAULT_LIMITS } from '../src/engine/types';
import type { EngineLimits } from '../src/engine/types';

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = result * (n - i + 1) / i;
  return Math.round(result);
}

function cardSlot(cardId: string, count = 1, distinctNames = false): Slot {
  return { id: '', source: { type: 'card', cardId }, count, distinctNames };
}

function groupSlot(groupId: string, count = 1, distinctNames = false): Slot {
  return { id: '', source: { type: 'group', groupId }, count, distinctNames };
}

function pattern(id: string, slots: Slot[]): Pattern {
  return { id, name: id, enabled: true, slots: slots.map((slot, i) => ({ ...slot, id: `${id}:${i}` })) };
}

function group(id: string, cardIds: string[]): CardGroup {
  return { id, name: id, filter: { op: 'pred', pred: { kind: 'cards', cardIds } }, include: [], exclude: [] };
}

function makeDeck(counts: Record<string, number>, patterns: Pattern[], groups: CardGroup[] = []): Deck {
  const cards: CardData[] = Object.keys(counts).map(id => ({
    id, name: id, kind: 'monster', monsterTypes: ['effect'], text: '',
  }));
  return {
    id: 'deck', name: 'テスト',
    entries: cards.map(card => ({ cardId: card.id, name: card.name, count: counts[card.id], section: 'main' })),
    patterns, groups, customCards: cards, pageData: {}, updatedAt: 0,
  };
}

function inputFor(deck: Deck, handSizes = [5], limits?: Partial<EngineLimits>) {
  const cards = new Map(deck.customCards.map(card => [card.id, card]));
  const result = compile(deck, id => cards.get(id), handSizes, limits);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

// 物理カードを一枚ずつ割り当てる独立実装。エンジンのクラス・最大流を使わない。
function bruteForce(deck: Deck, handSize: number) {
  const physical = deck.entries.filter(entry => entry.section === 'main')
    .flatMap(entry => Array<string>(entry.count).fill(entry.cardId));
  const patterns = deck.patterns.filter(item => item.enabled && item.slots.length > 0);
  const matches = (hand: string[], item: Pattern) => {
    const used = new Set<number>();
    const assignSlot = (slotIndex: number): boolean => {
      if (slotIndex === item.slots.length) return true;
      const slot = item.slots[slotIndex];
      const source = slot.source;
      const target = source.type === 'group' ? deck.groups.find(candidate => candidate.id === source.groupId) : undefined;
      const names = new Set<string>();
      const assignCard = (remaining: number, start: number): boolean => {
        if (remaining === 0) return assignSlot(slotIndex + 1);
        for (let i = start; i < hand.length; i++) {
          if (used.has(i) || (slot.distinctNames && names.has(hand[i]))) continue;
          const belongs = source.type === 'card' ? hand[i] === source.cardId
            : target?.filter.op === 'pred' && target.filter.pred.kind === 'cards'
              && target.filter.pred.cardIds.includes(hand[i]);
          if (!belongs) continue;
          used.add(i);
          if (slot.distinctNames) names.add(hand[i]);
          if (assignCard(remaining - 1, i + 1)) return true;
          used.delete(i);
          if (slot.distinctNames) names.delete(hand[i]);
        }
        return false;
      };
      return assignCard(slot.count, 0);
    };
    return assignSlot(0);
  };
  let total = 0;
  let successes = 0;
  const perPattern: Record<string, number> = Object.fromEntries(patterns.map(item => [item.id, 0]));
  const hand: string[] = [];
  const enumerate = (start: number) => {
    if (hand.length === handSize) {
      total++;
      let any = false;
      for (const item of patterns) {
        if (matches(hand, item)) {
          perPattern[item.id]++;
          any = true;
        }
      }
      if (any) successes++;
      return;
    }
    for (let i = start; i <= physical.length - (handSize - hand.length); i++) {
      hand.push(physical[i]);
      enumerate(i + 1);
      hand.pop();
    }
  };
  enumerate(0);
  return { total, p: successes / total, perPattern: Object.fromEntries(
    Object.entries(perPattern).map(([id, count]) => [id, count / total]),
  ) };
}

describe('二項係数の式との一致', () => {
  const cases = [
    {
      name: 'Aを1枚以上',
      deck: makeDeck({ A: 3, O: 37 }, [pattern('P', [cardSlot('A')])]),
      expected: 1 - choose(37, 5) / choose(40, 5),
    },
    {
      name: 'AとBを両方',
      deck: makeDeck({ A: 3, B: 3, O: 34 }, [pattern('P', [cardSlot('A'), cardSlot('B')])]),
      expected: (choose(40, 5) - 2 * choose(37, 5) + choose(34, 5)) / choose(40, 5),
    },
    {
      name: 'AかBとBで一枚を二重使用しない',
      deck: makeDeck({ A: 3, B: 1, O: 36 }, [pattern('P', [groupSlot('AB'), cardSlot('B')])], [group('AB', ['A', 'B'])]),
      expected: (choose(40, 5) - choose(37, 5) - choose(39, 5) + choose(36, 5)) / choose(40, 5),
    },
    {
      name: '種類違い2枚',
      deck: makeDeck({ A: 3, B: 3, O: 34 }, [pattern('P', [groupSlot('AB', 2, true)])], [group('AB', ['A', 'B'])]),
      expected: (choose(40, 5) - 2 * choose(37, 5) + choose(34, 5)) / choose(40, 5),
    },
    {
      name: '種類指定なし2枚',
      deck: makeDeck({ A: 3, B: 3, O: 34 }, [pattern('P', [groupSlot('AB', 2)])], [group('AB', ['A', 'B'])]),
      expected: 1 - (choose(34, 5) + 6 * choose(34, 4)) / choose(40, 5),
    },
  ];
  it.each(cases)('$name', ({ deck, expected }) => {
    const result = runEngine(inputFor(deck))[0];
    expect(result.success.method).toBe('exact');
    expect(Math.abs(result.success.p - expected)).toBeLessThanOrEqual(1e-12);
    expect(result.perPattern.P.p).toBeCloseTo(expected, 12);
  });
});

describe('compileと射影', () => {
  it('通常クラスを集約し、種類違いに関係するCardIdだけ分離する', () => {
    const deck = makeDeck({ A: 3, B: 3, C: 2, D: 2, O: 2 }, [
      pattern('regular', [groupSlot('ABCD')]), pattern('distinct', [groupSlot('AB', 2, true)]),
    ], [group('ABCD', ['A', 'B', 'C', 'D']), group('AB', ['A', 'B'])]);
    const input = inputFor(deck);
    expect(input.classes.map(item => item.count)).toEqual([3, 3, 4]);
    expect(input.otherCount).toBe(2);
    const snapshot = JSON.stringify(input);
    const regular = project(input, input.patterns[0]);
    expect(regular.classes.map(item => item.count)).toEqual([10]);
    expect(regular.otherCount).toBe(2);
    const distinct = project(input, input.patterns[1]);
    expect(distinct.classes.map(item => item.count)).toEqual([3, 3]);
    expect(distinct.otherCount).toBe(6);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('未取得カードはincludeまたは特定カードでのみ所属し、excludeが優先する', () => {
    const deck = makeDeck({ A: 2, B: 2, C: 2 }, [
      pattern('filter', [groupSlot('G')]), pattern('direct', [cardSlot('C')]),
    ], [{
      id: 'G', name: 'G', filter: { op: 'not', child: { op: 'or', children: [] } },
      include: ['A', 'B'], exclude: ['B'],
    }]);
    const result = compile(deck, () => undefined, [1]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.otherCount).toBe(2);
    const output = runEngine(result.value)[0];
    expect(output.success.p).toBeCloseTo(4 / 6, 12);
    expect(output.perPattern.filter.p).toBeCloseTo(2 / 6, 12);
    expect(output.perPattern.direct.p).toBeCloseTo(2 / 6, 12);
  });

  it('エクストラ・サイド・無効・空パターンを対象から除く', () => {
    const deck = makeDeck({ A: 3, O: 37 }, [
      pattern('valid', [cardSlot('A')]),
      { ...pattern('disabled', [cardSlot('O')]), enabled: false }, pattern('empty', []),
    ]);
    deck.entries.push(
      { cardId: 'A', name: 'A', count: 15, section: 'extra' },
      { cardId: 'A', name: 'A', count: 15, section: 'side' },
    );
    const input = inputFor(deck);
    expect(input.deckSize).toBe(40);
    expect(input.classes.map(item => item.count)).toEqual([3]);
    expect(input.patterns.map(item => item.id)).toEqual(['valid']);
    expect(input.limits).toEqual(DEFAULT_LIMITS);
  });

  it('存在しないグループ参照は所属0枚になる', () => {
    const result = runEngine(inputFor(makeDeck({ A: 12 }, [pattern('P', [groupSlot('missing')])])))[0];
    expect(result.success.p).toBe(0);
    expect(result.perPattern.P.p).toBe(0);
  });

  it('有効パターンなしは指定の日本語エラー', () => {
    for (const patterns of [[], [pattern('empty', [])], [{ ...pattern('disabled', [cardSlot('A')]), enabled: false }]]) {
      expect(compile(makeDeck({ A: 12 }, patterns), () => undefined, [5])).toEqual({
        ok: false, error: '有効な初動パターンがありません',
      });
    }
  });

  it('デッキと手札枚数の範囲を検証する', () => {
    const deck = makeDeck({ A: 6 }, [pattern('P', [cardSlot('A')])]);
    for (const h of [0, -1, 1.5, 11, NaN, Infinity]) {
      expect(compile(deck, () => undefined, [h]).ok).toBe(false);
    }
    expect(compile(deck, () => undefined, [7])).toEqual({
      ok: false, error: '手札枚数 7 はメインデッキの枚数（6 枚）を超えています',
    });
    expect(compile(makeDeck({ A: 60, B: 2 }, deck.patterns), () => undefined, [5])).toEqual({
      ok: false, error: 'メインデッキが 60 枚を超えているため計算できません（現在 62 枚）',
    });
    expect(compile(makeDeck({}, deck.patterns), () => undefined, [1]).ok).toBe(false);
    expect(compile(deck, () => undefined, [1, 6]).ok).toBe(true);
    expect(compile(makeDeck({ A: 60 }, deck.patterns), () => undefined, [10]).ok).toBe(true);
  });

  it.each([{ samples: 0 }, { samples: 1.5 }, { exactMaxStates: -1 }, { seed: NaN }])('計算オプションの不正な値を拒否する: %j', limits => {
    expect(compile(makeDeck({ A: 6 }, [pattern('P', [cardSlot('A')])]), () => undefined, [5], limits).ok).toBe(false);
  });
});

describe('列挙と重み', () => {
  it.each<{ counts: Record<string, number>; members: string[]; h: number }>([
    { counts: { A: 3, B: 3, C: 6 }, members: ['A', 'B', 'C'], h: 5 },
    { counts: { A: 1, B: 1, O: 10 }, members: ['A', 'B'], h: 5 },
    { counts: { A: 60 }, members: ['A'], h: 10 },
    { counts: { A: 3, B: 2, O: 55 }, members: ['A', 'B'], h: 10 },
    { counts: { O: 12 }, members: ['missing'], h: 5 },
    { counts: { A: 3, B: 3, C: 6 }, members: ['A', 'B', 'C'], h: 1 },
    { counts: { A: 3, B: 3 }, members: ['A', 'B'], h: 6 },
  ])('重みの合計がC(N,h)に等しい: %j', ({ counts, members, h }) => {
    const input = inputFor(makeDeck(counts, [pattern('P', [groupSlot('G', 2, true)])], [group('G', members)]), [h]);
    const updates: number[][] = [];
    const result = runExact(input, h, (done, total) => updates.push([done, total]));
    expect(result.weightSum).toBe(choose(input.deckSize, h));
    expect(binomial(input.deckSize, h)).toBe(choose(input.deckSize, h));
    expect(updates.at(-1)).toEqual([countStates(input, h), countStates(input, h)]);
  });

  it('DPの状態数は全物理カードが別クラスならC(N,h)、集約後は4', () => {
    const counts = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`C${i}`, 1]));
    const deck = makeDeck(counts, [pattern('P', [groupSlot('G', 2, true)])], [group('G', Object.keys(counts))]);
    expect(countStates(inputFor(deck), 5)).toBe(choose(12, 5));
    const small = makeDeck({ A: 1, B: 1, O: 10 }, [pattern('P', [cardSlot('A'), cardSlot('B')])]);
    expect(countStates(inputFor(small), 5)).toBe(4);
  });

  it('必要枚数合計が手札を超える場合と種類数不足は0', () => {
    for (const slots of [[cardSlot('A', 3), cardSlot('B', 3)], [cardSlot('A', 2, true)]]) {
      const result = runEngine(inputFor(makeDeck({ A: 6, B: 6 }, [pattern('P', slots)])))[0];
      expect(result.success.p).toBe(0);
      expect(result.perPattern.P.p).toBe(0);
    }
  });

  it('同一カードを共有する2グループで二重使用しない', () => {
    const deck = makeDeck({ A: 1, O: 11 }, [pattern('P', [groupSlot('G1'), groupSlot('G2')])], [group('G1', ['A']), group('G2', ['A'])]);
    expect(runEngine(inputFor(deck))[0].success.p).toBe(0);
  });

  it('最大流が再割当てを行い、ネットワークを次の手札でも再利用できる', () => {
    const match = createHandMatcher([{ id: 'P', slots: [
      { count: 1, distinct: false, members: [0] },
      { count: 1, distinct: false, members: [1, 0] },
    ] }], 2);
    expect(match(Uint8Array.from([1, 1]))).toBe(true);
    expect(match(Uint8Array.from([0, 2]))).toBe(false);
    expect(match(Uint8Array.from([2, 0]))).toBe(true);
    expect(match(Uint8Array.from([1, 0]))).toBe(false);
    expect(match(Uint8Array.from([1, 1]))).toBe(true);
  });

  it('所属枚数の単純な合計は足りても割り当てられない手札を拒否する', () => {
    const match = createHandMatcher([{ id: 'P', slots: [
      { count: 1, distinct: false, members: [0] },
      { count: 1, distinct: false, members: [0] },
      { count: 1, distinct: false, members: [1, 2] },
    ] }], 3);
    expect(match(Uint8Array.from([1, 1, 1]))).toBe(false);
    expect(match(Uint8Array.from([2, 1, 0]))).toBe(true);
  });
});

describe('独立した総当たりとの一致', () => {
  const deck = makeDeck({ A: 3, B: 3, C: 2, D: 2, E: 2 }, [
    pattern('mixed', [groupSlot('AB', 2, true), cardSlot('A')]),
    pattern('twoDistinct', [groupSlot('ABC', 2, true), groupSlot('BCD', 2, true)]),
    pattern('overlap', [groupSlot('AB'), groupSlot('BCD')]),
    pattern('cards', [cardSlot('C'), groupSlot('AD')]),
    pattern('five', [groupSlot('ABC', 3, true), groupSlot('AB', 2)]),
  ], [group('AB', ['A', 'B']), group('ABC', ['A', 'B', 'C']), group('BCD', ['B', 'C', 'D']), group('AD', ['A', 'D'])]);
  const expected = bruteForce(deck, 5);

  it('N=12,h=5の792通りで全体・パターン別が一致する', () => {
    expect(expected.total).toBe(792);
    const result = runEngine(inputFor(deck))[0];
    expect(result.success.p).toBeCloseTo(expected.p, 12);
    for (const item of deck.patterns) {
      expect(result.perPattern[item.id].p).toBeCloseTo(expected.perPattern[item.id], 12);
    }
  });

  it('各パターンの射影は、そのパターンだけを有効にして計算した全体値と一致する', () => {
    const result = runEngine(inputFor(deck))[0];
    for (const item of deck.patterns) {
      const singleDeck = { ...deck, patterns: deck.patterns.map(candidate => ({ ...candidate, enabled: candidate.id === item.id })) };
      const single = runEngine(inputFor(singleDeck))[0];
      expect(single.success.p).toBeCloseTo(result.perPattern[item.id].p, 12);
      expect(single.success.p).toBeCloseTo(expected.perPattern[item.id], 12);
    }
  });

  it('同じCardIdのエントリを分割してもクラス・確率・総当たり結果が変わらない', () => {
    const splitDeck = { ...deck, entries: deck.entries.flatMap(entry => Array.from({ length: entry.count }, () => ({ ...entry, count: 1 }))) };
    const merged = inputFor(deck);
    const split = inputFor(splitDeck);
    expect(split).toEqual(merged);
    expect(bruteForce(splitDeck, 5)).toEqual(expected);
    const result = runEngine(split)[0];
    expect(result.success.p).toBeCloseTo(expected.p, 12);
    for (const item of deck.patterns) {
      expect(result.perPattern[item.id].p).toBeCloseTo(expected.perPattern[item.id], 12);
    }
  });

  it('サンプリングでも全体・各パターンが総当たりの0.01以内', () => {
    const result = runEngine(inputFor(deck, [5], { exactMaxStates: 0 }))[0];
    expect(Math.abs(result.success.p - expected.p)).toBeLessThanOrEqual(0.01);
    for (const item of deck.patterns) {
      expect(result.perPattern[item.id].method).toBe('sampling');
      expect(Math.abs(result.perPattern[item.id].p - expected.perPattern[item.id])).toBeLessThanOrEqual(0.01);
    }
  });
});

describe('サンプリング・方式選択・進捗', () => {
  const deck = makeDeck({ A: 3, B: 3, O: 34 }, [pattern('A', [cardSlot('A')]), pattern('B', [cardSlot('B')])]);

  it('同じシードでは完全に同じ推定値、厳密値との差は0.01以内、95%区間がpを含む', () => {
    const input = inputFor(deck, [5], { exactMaxStates: 1 });
    const first = runEngine(input)[0];
    const second = runEngine(input)[0];
    expect(first.success).toEqual(second.success);
    expect(first.perPattern).toEqual(second.perPattern);
    const exact = runEngine(inputFor(deck))[0];
    for (const [estimate, target] of [[first.success, exact.success], [first.perPattern.A, exact.perPattern.A], [first.perPattern.B, exact.perPattern.B]]) {
      expect(estimate.method).toBe('sampling');
      expect(estimate.samples).toBe(DEFAULT_LIMITS.samples);
      expect(Math.abs(estimate.p - target.p)).toBeLessThanOrEqual(0.01);
      expect(estimate.lo).toBeLessThanOrEqual(estimate.p);
      expect(estimate.hi).toBeGreaterThanOrEqual(estimate.p);
    }
    expect(runSampling({ ...input, limits: { ...input.limits, seed: 42 } }, 5).p).not.toBe(first.success.p);
  });

  it('Wilson区間は成功0回・全成功でも幅が0にならない', () => {
    for (const success of [false, true]) {
      const input = inputFor(makeDeck({ A: 12 }, [pattern('P', [cardSlot(success ? 'A' : 'missing')])]), [5], { samples: 1000 });
      const result = runSampling(input, 5);
      const z = 1.959963984540054;
      expect(result.p).toBe(Number(success));
      expect(result.hi! - result.lo!).toBeCloseTo(z * z / (1000 + z * z), 12);
      expect(result.hi).toBeGreaterThan(0);
      expect(result.lo).toBeLessThan(1);
      expect(result.lo).toBeLessThanOrEqual(result.p);
      expect(result.hi).toBeGreaterThanOrEqual(result.p);
    }
  });

  it('方式は全体と射影ごとに選び、閾値と等しい状態数は厳密計算する', () => {
    const input = inputFor(deck, [5], { exactMaxStates: 4 });
    expect(countStates(input, 5)).toBeGreaterThan(4);
    const result = runEngine(input)[0];
    expect(result.success.method).toBe('sampling');
    expect(result.perPattern.A).toMatchObject({ method: 'exact', states: 4 });
    expect(result.perPattern.B).toMatchObject({ method: 'exact', states: 4 });
  });

  it('全体の確率はパターン単独より小さくても補正しない', () => {
    const input = inputFor(makeDeck({ A: 1, B: 3, O: 8 }, [
      pattern('A', [cardSlot('A', 2)]), pattern('B', [cardSlot('B', 2)]),
    ]), [5], { exactMaxStates: 0, samples: 1, seed: 5 });
    const result = runEngine(input)[0];
    expect(result.success.p).toBe(0);
    expect(result.perPattern.B.p).toBe(1);
    expect(result.success).toEqual(runSampling(input, 5));
    for (const item of input.patterns) {
      expect(result.perPattern[item.id]).toEqual(runSampling(project(input, item), 5));
    }
  });

  it('N=60,h=10の状態数をDPで数え、列挙せずサンプリングに切り替える', () => {
    const counts = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`C${i}`, 1]));
    const input = inputFor(makeDeck(counts, [pattern('P', [groupSlot('G', 5, true)])], [group('G', Object.keys(counts))]), [10], { samples: 1000 });
    expect(countStates(input, 10)).toBe(choose(60, 10));
    const result = runEngine(input)[0];
    expect(result.success).toMatchObject({ method: 'sampling', p: 1, samples: 1000 });
    expect(result.perPattern.P).toMatchObject({ method: 'sampling', p: 1 });
  });

  it('指定順で手札枚数を返し、混在する計算の進捗が単調増加して合計に到達する', () => {
    const input = inputFor(deck, [6, 5, 1, 10], { exactMaxStates: 4, samples: 9000 });
    const snapshot = JSON.stringify(input);
    const updates: number[][] = [];
    const results = runEngine(input, (done, total) => updates.push([done, total]));
    expect(results.map(result => result.handSize)).toEqual([6, 5, 1, 10]);
    expect(results.every(result => result.elapsedMs >= 0)).toBe(true);
    const total = results.reduce((sum, result) => sum + [result.success, ...Object.values(result.perPattern)]
      .reduce((subtotal, estimate) => subtotal + (estimate.states ?? estimate.samples!), 0), 0);
    expect(updates[0]).toEqual([0, total]);
    expect(updates.at(-1)).toEqual([total, total]);
    expect(updates.every(([done, currentTotal], i) => currentTotal === total && done <= total && (i === 0 || done > updates[i - 1][0]))).toBe(true);
    expect(updates.length).toBeLessThanOrEqual(1 + 4 * 3 * 3);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('厳密列挙は4096状態ごとと完了時にだけ進捗を通知する', () => {
    const counts = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`C${i}`, 1]));
    const input = inputFor(makeDeck(counts, [pattern('P', [groupSlot('G', 2, true)])], [group('G', Object.keys(counts))]));
    const updates: number[][] = [];
    runExact(input, 5, (done, total) => updates.push([done, total]));
    expect(updates).toEqual([[4096, choose(16, 5)], [choose(16, 5), choose(16, 5)]]);
  });
});
