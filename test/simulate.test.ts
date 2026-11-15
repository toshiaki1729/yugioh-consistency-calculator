import { describe, expect, it, vi } from 'vitest';
import { createTrialRunner, runTrial } from '../src/engine/simulate';
import { DEFAULT_LIMITS } from '../src/engine/types';
import type {
  SimulationCondition, SimulationEffect, SimulationInput, SimulationPattern, SimulationStep,
} from '../src/engine/simulateTypes';

function pattern(members: number[], count = 1, conditions: SimulationCondition[] = []): SimulationPattern {
  return { id: 'pattern', slots: [{ members, count, distinct: false }], conditions };
}
function conditionOnly(...conditions: SimulationCondition[]): SimulationPattern {
  return { id: 'condition', slots: [], conditions };
}
function effect(card: number, steps: SimulationStep[], options: Partial<SimulationEffect> = {}): SimulationEffect {
  return { card, steps, oncePerTurn: false, firstOnly: false, drawLock: 'none', ...options };
}
function inputFor(order: number[], patterns: SimulationPattern[], effects: SimulationEffect[]): SimulationInput {
  const cards = Array.from({ length: Math.max(...order) + 1 }, (_, card) => ({
    key: `k${card + 1}`, count: order.filter(value => value === card).length,
  }));
  return { cards, patterns, effects, handSizes: [1], limits: { ...DEFAULT_LIMITS } };
}
function trial(order: number[], handSize: number, patterns: SimulationPattern[], effects: SimulationEffect[], value = 0.99) {
  return runTrial(inputFor(order, patterns, effects), order, handSize, () => () => value);
}
const draw = (count = 1): SimulationStep => ({ kind: 'draw', count });
const cost = (members: number[], destination: 'graveyard' | 'banishedFaceUp' = 'graveyard'): SimulationStep =>
  ({ kind: 'handCost', members, destination });
const moved = (members: number[], zones: ('graveyard' | 'banishedFaceUp' | 'banishedFaceDown')[],
  kind: 'movedIncludes' | 'movedExcludes' = 'movedIncludes'): SimulationCondition => ({ kind, members, zones });

describe('シミュレーションの停止と独立した目標', () => {
  it('残りの並びを見ずに A を手放し、2 通り中 B を引く場合だけ全体が成功する', () => {
    const patterns = [pattern([0], 2), pattern([1], 2)];
    const effects = [effect(2, [cost([0, 1]), draw()])];
    const outcomes = [[0, 1], [1, 0]].map(tail => trial([0, 1, 2, ...tail], 3, patterns, effects));
    expect(outcomes).toEqual([
      { overall: false, perPattern: [true, false] },
      { overall: true, perPattern: [false, true] },
    ]);
  });

  it('初手で成立していれば、成功を壊す効果も使わない', () => {
    expect(trial([0, 1, 2], 2, [pattern([0])], [effect(1, [cost([0]), draw()])]))
      .toEqual({ overall: true, perPattern: [true] });
  });

  it('全体は初手で止まり、単独目標は必要なドローまで進む', () => {
    expect(trial([0, 2, 1], 2, [pattern([0]), pattern([1])], [effect(2, [draw()])]))
      .toEqual({ overall: true, perPattern: [true, true] });
  });

  it('上から除外する条件は停止判断にも選択にも使わない', () => {
    const condition: SimulationCondition = { kind: 'deckAfterBanish', banish: 1, members: [0], count: 1 };
    const patterns = [pattern([1], 1, [condition])];
    expect(trial([1, 2, 0, 3], 2, patterns, [effect(2, [draw()])]))
      .toEqual({ overall: false, perPattern: [false] });
    // スロットのない条件だけの目標も、効果を使わずに最終判定する。
    expect(trial([2, 0, 3], 1, [conditionOnly(condition)], [effect(2, [{ kind: 'banishTop', count: 1 }])]).overall)
      .toBe(false);
  });

  it('全体と単独で止まる位置が違うため、全体だけ失敗することがある', () => {
    const conditions: SimulationCondition[] = [{ kind: 'deckAfterBanish', banish: 1, members: [0], count: 1 }];
    expect(trial([1, 2, 0, 3], 2, [pattern([1], 1, conditions), pattern([0])], [effect(2, [draw()])]))
      .toEqual({ overall: false, perPattern: [false, true] });
  });

  it('draw と handCost の間では成功として止めない', () => {
    expect(trial([0, 2, 0], 2, [pattern([0], 2)], [effect(2, [draw(), cost([0])])]).overall).toBe(false);
  });

  it('初手 5 枚から 6 枚へ増えた手札で最大流を判定する', () => {
    const target = pattern([0], 3);
    target.slots.push({ members: [1], count: 3, distinct: false });
    expect(trial([0, 0, 1, 1, 2, 0, 1], 5, [target], [effect(2, [draw(2)])]).overall).toBe(true);
  });

  it('同じ実物の二重割り当てをせず、種類違いはカード番号で数える', () => {
    const target = pattern([0, 1], 2);
    target.slots[0].distinct = true;
    expect(trial([0, 0, 1], 2, [target], []).overall).toBe(false);
    expect(trial([0, 1, 0], 2, [target], []).overall).toBe(true);
    target.slots.push({ members: [1], count: 1, distinct: false });
    expect(trial([0, 1, 0], 2, [target], []).overall).toBe(false);
  });
});

describe('発動条件と優先順', () => {
  it('使える最初の効果を優先し、上の効果が使えなければ次へ進む', () => {
    const effects = [effect(2, [{ kind: 'banishTop', count: 1 }]), effect(3, [draw()])];
    expect(trial([2, 3, 0, 1], 2, [pattern([0])], effects).overall).toBe(false);
    expect(trial([2, 3, 0, 1], 2, [pattern([0])], [...effects].reverse()).overall).toBe(true);
    effects[0].steps = [{ kind: 'banishTop', count: 3 }];
    expect(trial([2, 3, 0, 1], 2, [pattern([0])], effects).overall).toBe(true);
  });

  it.each([false, true])('oncePerTurn=%s: 途中で引いた同じカードの使用を制御する', oncePerTurn => {
    expect(trial([1, 1, 0], 1, [pattern([0])], [effect(1, [draw()], { oncePerTurn })]).overall)
      .toBe(!oncePerTurn);
  });

  it('firstOnly は他の効果の使用後には使えず、最初なら使える', () => {
    const effects = [effect(2, [draw()]), effect(3, [draw()], { firstOnly: true })];
    expect(trial([2, 3, 1, 0], 2, [pattern([0])], effects).overall).toBe(false);
    expect(trial([3, 0], 1, [pattern([0])], [effects[1]]).overall).toBe(true);
  });

  it.each(['after', 'turn'] as const)('%s の使用後は draw を含む効果を禁止する', drawLock => {
    const effects = [effect(2, [draw()], { drawLock }), effect(3, [draw()])];
    expect(trial([2, 3, 1, 0], 2, [pattern([0])], effects).overall).toBe(false);
    effects[1].steps = [{ kind: 'excavate', count: 1, members: null }];
    expect(trial([2, 3, 1, 0], 2, [pattern([0])], effects).overall).toBe(true);
  });

  it('turn は先にドローしていたら使えず、excavate 後なら使える', () => {
    const effects = [effect(2, [draw()]), effect(3, [{ kind: 'excavate', count: 1, members: null }], { drawLock: 'turn' })];
    expect(trial([2, 3, 1, 0], 2, [pattern([0])], effects).overall).toBe(false);
    effects[0].steps = [{ kind: 'excavate', count: 1, members: null }];
    expect(trial([2, 3, 1, 0], 2, [pattern([0])], effects).overall).toBe(true);
  });

  it('draw・banishTop・excavate の枚数を合算して発動前に確認する', () => {
    const steps: SimulationStep[] = [draw(), { kind: 'banishTop', count: 1 }, { kind: 'excavate', count: 1, members: null }];
    expect(trial([2, 0, 1], 1, [pattern([0])], [effect(2, steps)]).overall).toBe(false);
  });

  it('handCost は発動前に対象が必要で、自身の 1 枚を数えない', () => {
    const effects = [effect(1, [draw(), cost([0, 1])])];
    expect(trial([1, 0, 0], 1, [pattern([0])], effects).overall).toBe(false);
    expect(trial([1, 1, 0], 2, [pattern([0])], effects).overall).toBe(true);
  });

  it('同じ対象のコストは配列順・送り先が違っても必要枚数を合算する', () => {
    const effects = [effect(2, [draw(), cost([0, 1]), cost([1, 0], 'banishedFaceUp')])];
    const target = conditionOnly(moved([0, 1], ['graveyard']), moved([0, 1], ['banishedFaceUp']));
    expect(trial([2, 0, 1, 3], 2, [target], effects).overall).toBe(false);
    expect(trial([2, 0, 1, 3], 3, [target], effects).overall).toBe(true);
  });

  it('異なるコスト対象はそれぞれの必要枚数を確認する', () => {
    const effects = [effect(2, [cost([0]), cost([1])])];
    expect(trial([2, 0, 0, 1], 3, [conditionOnly(moved([0], ['graveyard']))], effects).overall).toBe(false);
  });

  it('異なる対象が重なる場合は厳密割り当てをせず、処理時に対象がなければ何もしない', () => {
    const effects = [effect(2, [cost([0]), cost([0, 1]), draw()])];
    const targets = [pattern([1], 1, [moved([0], ['graveyard'])])];
    expect(trial([2, 0, 1], 2, targets, effects).overall).toBe(true);
  });
});

describe('選択とデッキの並び', () => {
  it('サーチ後の Fisher–Yates が乱数値によって次のドローを変える', () => {
    const effects = [effect(2, [{ kind: 'search', members: [0] }, draw()])];
    expect(trial([2, 0, 0, 1], 1, [pattern([1])], effects, 0).overall).toBe(true);
    expect(trial([2, 0, 0, 1], 1, [pattern([1])], effects, 0.99).overall).toBe(false);
  });

  it('サーチ対象がなければ何もせず、乱数源を呼ばない', () => {
    const order = [2, 0, 1];
    const input = inputFor(order, [pattern([0])], [effect(2, [{ kind: 'search', members: [2] }, draw()])]);
    const random = vi.fn(() => 0);
    expect(runTrial(input, order, 1, () => random)).toEqual({ overall: true, perPattern: [true] });
    expect(random).not.toHaveBeenCalled();
  });

  it('各目標に同じ乱数列を作り、入力と並びを変更しない', () => {
    const order = [2, 0, 0, 1];
    const input = inputFor(order, [pattern([1]), pattern([1])], [effect(2, [{ kind: 'search', members: [0] }, draw()])]);
    const original = JSON.stringify(input);
    const sources: ReturnType<typeof vi.fn>[] = [];
    const createRandom = () => { const source = vi.fn(() => 0); sources.push(source); return source; };
    const run = createTrialRunner(input);
    const expected = { overall: true, perPattern: [true, true] };
    expect(run(order, 1, createRandom)).toEqual(expected);
    expect(sources).toHaveLength(3);
    for (const source of sources) expect(source).toHaveBeenCalledTimes(1);
    expect(run(Uint8Array.from(order), 1, () => () => 0.99)).toEqual({ overall: false, perPattern: [false, false] });
    expect(run(order, 1, createRandom)).toEqual(expected);
    expect(JSON.stringify(input)).toBe(original);
    expect(order).toEqual([2, 0, 0, 1]);
  });

  it('excavate は一致なしなら全部を下へ戻し、一致ありでも残りを次に引かない', () => {
    const effects = [effect(2, [{ kind: 'excavate', count: 2, members: [2] }, draw()])];
    expect(trial([2, 0, 0, 1], 1, [pattern([1])], effects).overall).toBe(true);
    effects[0].steps[0] = { kind: 'excavate', count: 2, members: [0] };
    expect(trial([2, 0, 0, 1], 1, [pattern([0], 2)], effects).overall).toBe(false);
    expect(trial([2, 0, 0, 1], 1, [pattern([1])], effects).overall).toBe(true);
  });

  it('excavate で下へ戻したカードも、サーチ後のシャッフルに含める', () => {
    const effects = [effect(3, [
      { kind: 'excavate', count: 1, members: [3] },
      { kind: 'search', members: [1] }, draw(),
    ])];
    expect(trial([3, 0, 1, 2], 1, [pattern([0])], effects, 0).overall).toBe(true);
    expect(trial([3, 0, 1, 2], 1, [pattern([0])], effects, 0.99).overall).toBe(false);
  });

  it.each(['search', 'excavate'] as const)('%s は即成立する候補をスロット得点より優先する', kind => {
    const patterns = [pattern([0], 2), pattern([0], 3), pattern([1])];
    const step: SimulationStep = kind === 'search'
      ? { kind, members: [0, 1] } : { kind, count: 2, members: null };
    expect(trial([2, 0, 1], 1, patterns, [effect(2, [step])]).overall).toBe(true);
  });

  it('成立候補がなければスロットへの所属数、同点ならカード番号で選ぶ', () => {
    const effects = [effect(2, [{ kind: 'search', members: [1, 0] }, draw()])];
    const patterns = [pattern([0], 2), pattern([1], 2)];
    expect(trial([2, 0, 1, 1], 1, patterns, effects).overall).toBe(false);
    patterns.push(pattern([1], 3));
    expect(trial([2, 1, 1, 0], 1, patterns, effects).overall).toBe(true);
  });

  it('handCost はドローしたカードも候補にして、移動による即成立を優先する', () => {
    const target = conditionOnly(moved([1], ['banishedFaceUp']));
    expect(trial([2, 0, 1], 2, [target], [effect(2, [draw(), cost([0, 1], 'banishedFaceUp')])]).overall).toBe(true);
  });

  it('handCost の既定選択ではスロットと条件への関係が少ないものを手放す', () => {
    const target = pattern([0], 2, [moved([0], ['graveyard'], 'movedExcludes')]);
    expect(trial([2, 0, 1, 0], 3, [target], [effect(2, [cost([0, 1]), draw()])]).overall).toBe(true);
    const conditionTarget = pattern([2], 1, [moved([0], ['graveyard'], 'movedExcludes')]);
    expect(trial([3, 0, 1, 2], 3, [conditionTarget], [effect(3, [cost([0, 1]), draw()])]).overall).toBe(true);
  });

  it('サーチ直後の deckAtLeast は選んだカードをデッキから引いて判定する', () => {
    const target = pattern([0, 1], 1, [{ kind: 'deckAtLeast', members: [0], count: 1 }]);
    expect(trial([2, 0, 1], 1, [target], [effect(2, [{ kind: 'search', members: [0, 1] }])]).overall).toBe(true);
  });

  it('選択時にも deckAfterBanish を参照せず、番号の小さい成立候補を選ぶ', () => {
    const target = pattern([0], 1, [{ kind: 'deckAfterBanish', banish: 1, members: [0], count: 1 }]);
    const effects = [effect(2, [{ kind: 'search', members: [0, 1] }])];
    expect(trial([2, 0, 1], 1, [target, pattern([1])], effects))
      .toEqual({ overall: false, perPattern: [false, true] });
  });

  it('サーチで残りを使い切った場合、後続のドローは実際に残っている枚数だけ処理する', () => {
    const effects = [effect(2, [{ kind: 'search', members: [0] }, draw()])];
    expect(trial([2, 0], 1, [pattern([0]), pattern([0], 2)], effects))
      .toEqual({ overall: true, perPattern: [true, false] });
  });
});

describe('移動の記録と残り枚数', () => {
  it.each(['graveyard', 'banishedFaceUp'] as const)('%s への手札コストを他の移動先と区別する', destination => {
    const patterns = ['graveyard', 'banishedFaceUp', 'banishedFaceDown'].map(zone =>
      conditionOnly(moved([0], [zone as 'graveyard'])));
    const result = trial([2, 0, 1], 2, patterns, [effect(2, [cost([0], destination)])]);
    expect(result.perPattern).toEqual([destination === 'graveyard', destination === 'banishedFaceUp', false]);
  });

  it('裏側除外だけを記録し、複数の移動先を OR で調べる', () => {
    const patterns = [
      conditionOnly(moved([0], ['banishedFaceDown'])),
      conditionOnly(moved([0], ['graveyard', 'banishedFaceDown'])),
      conditionOnly(moved([0], ['graveyard'])),
      pattern([1], 1, [moved([0], ['banishedFaceDown'], 'movedExcludes')]),
      pattern([1], 1, [moved([0], ['graveyard', 'banishedFaceUp'], 'movedExcludes')]),
    ];
    const result = trial([2, 0, 1], 1, patterns, [effect(2, [{ kind: 'banishTop', count: 1 }, draw()])]);
    expect(result.perPattern).toEqual([true, true, false, false, true]);
  });

  it('使った効果カード自身は墓地の移動記録に入らない', () => {
    const patterns = [conditionOnly(moved([2], ['graveyard'])), pattern([0], 1, [moved([2], ['graveyard'], 'movedExcludes')])];
    expect(trial([2, 0], 1, patterns, [effect(2, [draw()])]).perPattern).toEqual([false, true]);
  });

  it('デッキ残数はドロー・除外・サーチ後に減り、めくって戻した分は残る', () => {
    const remaining: SimulationCondition = { kind: 'deckAtLeast', members: [0], count: 2 };
    const target = pattern([1], 1, [remaining]);
    expect(trial([2, 0, 0, 1], 1, [target], [effect(2, [{ kind: 'excavate', count: 2, members: [2] }, draw()])]).overall).toBe(true);
    expect(trial([2, 0, 0, 1], 1, [target], [effect(2, [{ kind: 'banishTop', count: 2 }, draw()])]).overall).toBe(false);
    expect(trial([2, 0, 1, 0], 1, [target], [effect(2, [draw(2)])]).overall).toBe(false);
  });

  it('上から除外した後の残数を調べ、残りが除外枚数以下なら失敗する', () => {
    const target = conditionOnly({ kind: 'deckAfterBanish', banish: 2, members: [0], count: 1 });
    expect(trial([2, 1, 1, 0], 1, [target], []).overall).toBe(true);
    expect(trial([2, 0, 1, 1], 1, [target], []).overall).toBe(false);
    expect(trial([2, 0, 0], 1, [target], []).overall).toBe(false);
    expect(trial([2, 0], 1, [target], []).overall).toBe(false);
  });

  it('有効パターンがなければ全体は失敗する', () => {
    expect(trial([0], 1, [], [])).toEqual({ overall: false, perPattern: [] });
  });
});
