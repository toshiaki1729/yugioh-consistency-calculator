import { describe, expect, it, vi } from 'vitest';
import type { CardTarget, Deck, PatternCondition } from '../src/domain/types';
import { compile } from '../src/engine/compile';
import { compileCalculation } from '../src/engine/compileCalculation';
import { runCalculation, runEngine } from '../src/engine/run';
import { stableInputKey } from '../src/ui/patterns/CalculationProvider';
import {
  compileCalculationDeck, createCalculationDeck, createCalculationEffect, resolveCalculationCard,
} from './fixtures/calculationDeck';

const target: CardTarget = { type: 'card', cardId: 'k1' };

describe('計算方式の選択と従来との互換', () => {
  it.each([2_000_000, 0])('効果なしはcompileと入力・全結果が完全一致する（上限%d）', exactMaxStates => {
    const deck = createCalculationDeck();
    deck.effects = [];
    const previous = compile(deck, resolveCalculationCard, [5, 6], { exactMaxStates, samples: 1000 });
    const current = compileCalculationDeck(deck, [5, 6], { exactMaxStates, samples: 1000 });
    expect(current.mode).toBe('classes');
    expect(previous).toEqual({ ok: true, value: current.input });
    if (!previous.ok) throw new Error(previous.error);
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    expect(runCalculation(current)).toEqual(runEngine(previous.value));
    clock.mockRestore();
  });

  it.each(['extra', 'side', 'absent'] as const)('メインにない効果は無視する: %s', section => {
    const deck = createCalculationDeck();
    deck.effects[0].cardId = 'k4';
    if (section !== 'absent') deck.entries.push({ cardId: 'k4', name: '効果', count: 1, section });
    expect(compileCalculationDeck(deck).mode).toBe('classes');
  });

  it.each(['movedIncludes', 'movedExcludes'] as const)('効果なしの%sはclassesで計算する', kind => {
    const deck = createCalculationDeck();
    deck.effects = [];
    deck.patterns[0].slots = [];
    deck.patterns[0].conditions = [{ kind, target, zones: ['graveyard'] }];
    const input = compileCalculationDeck(deck);
    expect(input.mode).toBe('classes');
    expect(compile(deck, resolveCalculationCard, [5])).toEqual({ ok: true, value: input.input });
    const result = runCalculation(input)[0];
    expect(result.success.p).toBe(kind === 'movedIncludes' ? 0 : 1);
    expect(result.perPattern.P).toEqual(result.success);
  });

  it('有効なdeckAfterBanishだけをシミュレーションの条件とする', () => {
    const deck = createCalculationDeck();
    deck.effects = [];
    deck.patterns.push({ id: 'banish', name: '除外', enabled: false, slots: [], conditions: [
      { kind: 'deckAfterBanish', target, count: 1, banish: 3 },
    ] });
    expect(compileCalculationDeck(deck).mode).toBe('classes');
    deck.patterns[1].enabled = true;
    expect(compileCalculationDeck(deck).mode).toBe('simulation');
    expect(compile(deck, resolveCalculationCard, [5])).toEqual({
      ok: false, error: 'この計算には compileCalculation を使ってください',
    });
  });

  it('メインの効果はcompileCalculationだけで受け付ける', () => {
    const deck = createCalculationDeck();
    expect(compileCalculationDeck(deck).mode).toBe('simulation');
    expect(compile(deck, resolveCalculationCard, [5])).toEqual({
      ok: false, error: 'この計算には compileCalculation を使ってください',
    });
  });

  it('共通の検証エラーの文言と順序を維持する', () => {
    const deck = createCalculationDeck();
    deck.effects = [];
    const cases = [
      { deck: { ...deck, entries: [{ ...deck.entries[0], count: 61 }] }, hands: [0], limits: {} },
      { deck, hands: [0], limits: {} }, { deck, hands: [11], limits: {} },
      { deck: { ...deck, entries: [{ ...deck.entries[0], count: 1 }] }, hands: [5], limits: {} },
      { deck: { ...deck, patterns: [] }, hands: [5], limits: { samples: 0 } },
      ...[{ samples: 0 }, { exactMaxStates: -1 }, { seed: 1.5 }].map(limits => ({ deck, hands: [5], limits })),
    ];
    for (const item of cases) {
      const expected = compile(item.deck, resolveCalculationCard, item.hands, item.limits);
      expect(expected.ok).toBe(false);
      expect(compileCalculation(item.deck, resolveCalculationCard, item.hands, item.limits)).toEqual(expected);
      expect(compileCalculation({ ...item.deck, effects: [createCalculationEffect()] },
        resolveCalculationCard, item.hands, item.limits)).toEqual(expected);
    }
  });
});

it('カード・グループ・全条件・全手順をメインのカード番号に解決する', () => {
  const deck = createCalculationDeck([3, 2, 4]);
  deck.entries.push({ ...deck.entries[0], count: 1 },
    { cardId: 'k4', name: 'サイド', section: 'side', count: 3 });
  deck.groups[0].include = ['k3', 'k4'];
  deck.groups[0].exclude = ['k1'];
  const group: CardTarget = { type: 'group', groupId: 'starter' };
  const missing: CardTarget = { type: 'card', cardId: 'k4' };
  deck.patterns[0].slots.push({ id: 'missing', source: missing, count: 2, distinctNames: true });
  deck.patterns[0].conditions = [
    { kind: 'deckAtLeast', target: group, count: 2 },
    { kind: 'movedIncludes', target, zones: ['graveyard', 'banishedFaceDown'] },
    { kind: 'movedExcludes', target: missing, zones: ['banishedFaceUp'] },
    { kind: 'deckAfterBanish', target: group, count: 1, banish: 3 },
  ];
  deck.effects[0] = { ...deck.effects[0], oncePerTurn: true, firstOnly: true, drawLock: 'turn', steps: [
    { kind: 'draw', count: 2 }, { kind: 'banishTop', count: 3 },
    { kind: 'excavate', count: 2, target: null }, { kind: 'excavate', count: 1, target: group },
    { kind: 'search', target: missing }, { kind: 'handCost', target, destination: 'banishedFaceUp' },
  ] };
  deck.effects.push({ ...createCalculationEffect(), id: 'ignored', cardId: 'k4' });
  const original = structuredClone(deck);
  const compiled = compileCalculationDeck(deck);
  if (compiled.mode !== 'simulation') throw new Error('方式が違います');
  expect(compiled.input.cards).toEqual([
    { key: 'k1', count: 4 }, { key: 'k2', count: 2 }, { key: 'k3', count: 4 },
  ]);
  expect(compiled.input.patterns).toEqual([{ id: 'P', slots: [
    { members: [2], count: 1, distinct: false }, { members: [], count: 2, distinct: true },
  ], conditions: [
    { kind: 'deckAtLeast', members: [2], count: 2 },
    { kind: 'movedIncludes', members: [0], zones: ['graveyard', 'banishedFaceDown'] },
    { kind: 'movedExcludes', members: [], zones: ['banishedFaceUp'] },
    { kind: 'deckAfterBanish', members: [2], count: 1, banish: 3 },
  ] }]);
  expect(compiled.input.effects).toEqual([{
    card: 1, oncePerTurn: true, firstOnly: true, drawLock: 'turn', steps: [
      { kind: 'draw', count: 2 }, { kind: 'banishTop', count: 3 },
      { kind: 'excavate', count: 2, members: null }, { kind: 'excavate', count: 1, members: [2] },
      { kind: 'search', members: [] }, { kind: 'handCost', members: [0], destination: 'banishedFaceUp' },
    ],
  }]);
  expect(deck).toEqual(original);
});

it('未取得カードのグループ所属はinclude/excludeだけで判定する', () => {
  const deck = createCalculationDeck();
  deck.groups[0].filter = { op: 'not', child: { op: 'or', children: [] } };
  deck.groups[0].include = ['k1', 'k2'];
  deck.groups[0].exclude = ['k2'];
  const compiled = compileCalculation(deck, () => undefined, [5]);
  if (!compiled.ok) throw new Error(compiled.error);
  expect(compiled.value.input.patterns[0].slots[0].members).toEqual([0]);
});

it('効果の追加・変更・並べ替えと条件の変更で入力キーが変わる', () => {
  const deck = createCalculationDeck();
  deck.effects.push({ ...createCalculationEffect(), id: 'second', cardId: 'k3' });
  deck.patterns[0].conditions = [{ kind: 'deckAtLeast', target, count: 1 }];
  const key = stableInputKey(compileCalculationDeck(deck));
  const changes: ((changed: Deck) => void)[] = [
    changed => { changed.effects.reverse(); },
    changed => { changed.effects[0].oncePerTurn = true; },
    changed => { changed.effects[0].steps = [{ kind: 'draw', count: 2 }]; },
    changed => { changed.effects.push({ ...createCalculationEffect(), id: 'third', cardId: 'k1' }); },
    changed => { changed.patterns[0].conditions = [{ kind: 'deckAtLeast', target, count: 2 }]; },
  ];
  for (const change of changes) {
    const changed = structuredClone(deck);
    change(changed);
    expect(stableInputKey(compileCalculationDeck(changed))).not.toBe(key);
  }
  const noEffects = { ...deck, effects: [] };
  expect(stableInputKey(compileCalculationDeck(noEffects))).not.toBe(key);
});

it.each(['movedIncludes', 'movedExcludes'] as const)('シミュレーションの条件だけの%sを判定する', kind => {
  const deck = createCalculationDeck([1, 1, 4]);
  deck.patterns[0].slots = [];
  deck.patterns[0].conditions = [{ kind, target, zones: ['banishedFaceUp'] } satisfies PatternCondition];
  deck.effects[0].steps = [{ kind: 'handCost', target, destination: 'banishedFaceUp' }];
  const result = runCalculation(compileCalculationDeck(deck, [6], { samples: 10 }))[0];
  expect(result.success).toMatchObject({ method: 'simulation', p: 1 });
});
