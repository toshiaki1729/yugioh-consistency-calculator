import { describe, expect, it } from 'vitest';
import type { EffectStep } from '../src/domain/types';
import { validateAppState, validateDeck } from '../src/domain/validate';
import { cardTarget, createEffect, createEffectsDeck, createEffectsState, groupTarget, unwrap } from './fixtures/effectsDeck';

function withConditions(conditions: unknown) {
  const deck = createEffectsDeck();
  return { ...deck, patterns: [{ ...deck.patterns[0], conditions }] };
}

function withSteps(steps: unknown) {
  return { ...createEffectsDeck(), effects: [{ ...createEffect(), steps }] };
}

describe('追加条件とドロー効果の入力検証', () => {
  it('全種類・全移動先・全制限とカード対象を保持し、条件だけのパターンを許可する', () => {
    const deck = createEffectsDeck();
    deck.patterns[0].conditions = [
      { kind: 'deckAtLeast', target: groupTarget, count: 60 },
      { kind: 'deckAfterBanish', target: cardTarget, count: 1, banish: 20 },
      { kind: 'movedExcludes', target: groupTarget, zones: ['graveyard', 'banishedFaceUp', 'banishedFaceDown'] },
      { kind: 'movedIncludes', target: cardTarget, zones: ['banishedFaceUp'] },
    ];
    const steps: EffectStep[] = [
      { kind: 'draw', count: 5 }, { kind: 'banishTop', count: 20 },
      { kind: 'excavate', count: 10, target: null }, { kind: 'excavate', count: 1, target: groupTarget },
      { kind: 'search', target: cardTarget },
      { kind: 'handCost', target: groupTarget, destination: 'graveyard' },
    ];
    deck.effects = ['none', 'after', 'turn'].map((drawLock, i) => ({
      ...createEffect(), id: `e${i}`, cardId: `k${i + 1}`, oncePerTurn: true, firstOnly: true,
      drawLock: drawLock as 'none' | 'after' | 'turn', steps,
    }));
    expect(unwrap(validateDeck(deck))).toEqual(deck);
    expect(unwrap(validateDeck(withConditions([]))).patterns[0].slots).toEqual([]);
    expect(validateDeck(withSteps([{ kind: 'handCost', target: cardTarget, destination: 'banishedFaceUp' }])).ok).toBe(true);
  });

  it.each([
    ['deckAtLeast', 'count', 60], ['deckAfterBanish', 'count', 60], ['deckAfterBanish', 'banish', 20],
  ] as const)('条件 %s.%s の境界と数値型', (kind, field, max) => {
    for (const value of [1, max, 0, max + 1, -1, 1.5, NaN, Infinity, '1', null, undefined]) {
      const condition = { kind, target: cardTarget, count: 1, banish: 1, [field]: value };
      const result = validateDeck(withConditions([condition]));
      expect(result.ok, `${kind}.${field}=${value}`).toBe(value === 1 || value === max);
      if (!result.ok) expect(result.error).toContain(field);
    }
  });

  it.each([['draw', 5], ['banishTop', 20], ['excavate', 10]] as const)(
    '手順 %s の境界と数値型', (kind, max) => {
      for (const count of [1, max, 0, max + 1, -1, 1.5, NaN, Infinity, '1', null, undefined]) {
        expect(validateDeck(withSteps([{ kind, count, target: null }])).ok, `${kind}=${count}`)
          .toBe(count === 1 || count === max);
      }
    },
  );

  it.each(['movedIncludes', 'movedExcludes'])('%s の移動先は1〜3種類、重複不可', kind => {
    for (const zones of [[], ['graveyard', 'graveyard'], ['unknown'], null, 'graveyard', undefined,
      ['graveyard', 'banishedFaceUp', 'banishedFaceDown', 'graveyard']]) {
      expect(validateDeck(withConditions([{ kind, target: groupTarget, zones }])).ok).toBe(false);
    }
    for (const zones of [['graveyard'], ['banishedFaceUp', 'banishedFaceDown']]) {
      expect(validateDeck(withConditions([{ kind, target: groupTarget, zones }])).ok).toBe(true);
    }
  });

  it('条件8件・効果30件・手順1〜6件まで受け付ける', () => {
    for (const count of [0, 8, 9]) {
      expect(validateDeck(withConditions(Array(count).fill({ kind: 'deckAtLeast', target: cardTarget, count: 1 }))).ok).toBe(count <= 8);
    }
    for (const count of [0, 30, 31]) {
      const effects = Array.from({ length: count }, (_, i) => ({ ...createEffect(), id: `e${i}`, cardId: `k${i + 1}` }));
      expect(validateDeck({ ...createEffectsDeck(), effects }).ok).toBe(count <= 30);
    }
    for (const count of [0, 1, 6, 7]) {
      expect(validateDeck(withSteps(Array(count).fill({ kind: 'draw', count: 1 }))).ok).toBe(count >= 1 && count <= 6);
    }
  });

  it.each(['id', 'cardId'] as const)('ドロー効果の %s はデッキ内で一意', field => {
    const first = createEffect();
    const second = { ...first, id: 'e2', cardId: 'k2', [field]: first[field] };
    const result = validateDeck({ ...createEffectsDeck(), effects: [first, second] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('重複');
  });

  it.each([null, {}, 1, 'array'])('conditions / effects の %j は空配列に補わず拒否する', value => {
    expect(validateDeck(withConditions(value)).ok).toBe(false);
    expect(validateDeck({ ...createEffectsDeck(), effects: value }).ok).toBe(false);
  });

  it('省略時だけ空配列を補い、新しい配列として返す', () => {
    const { effects: _, ...deck } = createEffectsDeck();
    const { conditions: __, ...pattern } = deck.patterns[0];
    const result = unwrap(validateDeck({ ...deck, patterns: [pattern] }));
    expect(result.effects).toEqual([]);
    expect(result.patterns[0].conditions).toEqual([]);
    expect(unwrap(validateDeck(withConditions(undefined))).patterns[0].conditions).toEqual([]);
  });

  it.each([
    { id: '' }, { cardId: 'toString' }, { cardId: '__proto__' }, { cardId: 'k01' },
    { oncePerTurn: undefined }, { oncePerTurn: 'true' }, { firstOnly: null },
    { firstOnly: 1 }, { drawLock: undefined }, { drawLock: 'unknown' },
    { steps: null }, { steps: {} }, { steps: undefined },
  ])('効果の不正なフィールド %j を拒否する', fields => {
    expect(validateDeck({ ...createEffectsDeck(), effects: [{ ...createEffect(), ...fields }] }).ok).toBe(false);
  });

  it.each([null, {}, 'condition', { kind: 'unknown' }])('不正な条件と手順 %j を拒否する', value => {
    expect(validateDeck(withConditions([value])).ok).toBe(false);
    expect(validateDeck(withSteps([value])).ok).toBe(false);
  });

  it.each([undefined, null, {}, { type: 'other' }, { type: 'group', groupId: '' },
    ...['toString', '__proto__', 'k0', 'k01', 'c:', 'c:!'].map(cardId => ({ type: 'card', cardId })),
  ])('条件・各手順の不正な対象 %j を拒否する', target => {
    for (const kind of ['deckAtLeast', 'deckAfterBanish', 'movedIncludes', 'movedExcludes']) {
      expect(validateDeck(withConditions([{ kind, target, count: 1, banish: 1, zones: ['graveyard'] }])).ok).toBe(false);
    }
    for (const kind of ['search', 'handCost', 'excavate']) {
      expect(validateDeck(withSteps([{ kind, target, count: 1, destination: 'graveyard' }])).ok)
        .toBe(kind === 'excavate' && target === null);
    }
  });

  it.each(['banishedFaceDown', null, undefined, 'unknown'])('手札コストの不正な送り先 %j を拒否する', destination => {
    expect(validateDeck(withSteps([{ kind: 'handCost', target: cardTarget, destination }])).ok).toBe(false);
  });

  it('不在でも形式が正しいカード対象・効果カードは保持する', () => {
    expect(validateDeck(withConditions([{ kind: 'deckAtLeast', count: 1, target: { type: 'card', cardId: 'c:absent' } }])).ok).toBe(true);
    expect(validateDeck({ ...createEffectsDeck(), effects: [{ ...createEffect(), cardId: 'k999' }] }).ok).toBe(true);
  });
});

describe('条件と効果の参照切れ', () => {
  it('複数デッキの削除件数を集計し、条件は個別・効果は全体を削除し、入力を変更しない', () => {
    const state = createEffectsState();
    const deck = state.decks[0];
    const missing = { type: 'group', groupId: 'missing' } as const;
    deck.patterns[0].slots = [{ id: 's1', source: missing, count: 1, distinctNames: false }];
    deck.patterns[0].conditions.push({ kind: 'movedIncludes', target: missing, zones: ['graveyard'] });
    deck.effects.push({ ...createEffect(), id: 'e2', cardId: 'k2', steps: [
      { kind: 'draw', count: 1 }, { kind: 'search', target: missing }, { kind: 'handCost', target: missing, destination: 'graveyard' },
    ] });
    state.decks.push({ ...structuredClone(deck), id: 'd2' });
    const before = structuredClone(state);
    expect(validateAppState(state).ok).toBe(false);
    const result = unwrap(validateAppState(state, { dropDanglingSlots: true }));
    expect(result).toMatchObject({ droppedSlots: 2, droppedConditions: 2, droppedEffects: 2 });
    for (const item of result.state.decks) {
      expect(item.patterns[0].slots).toEqual([]);
      expect(item.patterns[0].conditions).toEqual([deck.patterns[0].conditions[0]]);
      expect(item.effects).toEqual([deck.effects[0]]);
    }
    expect(state).toEqual(before);
  });

  it.each(['deckAtLeast', 'deckAfterBanish', 'movedIncludes', 'movedExcludes'] as const)(
    '%s の参照切れは通常の検証では拒否する', kind => {
      const condition = { kind, target: { type: 'group', groupId: 'missing' }, count: 1, banish: 1, zones: ['graveyard'] };
      const result = validateDeck(withConditions([condition]));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('追加の条件 1');
        expect(result.error).toContain('missing');
      }
    },
  );

  it.each(['search', 'excavate', 'handCost'])('%s に参照切れがある効果は復元時に丸ごと削除する', kind => {
    const state = createEffectsState();
    const steps = [{ kind, count: 1, target: { type: 'group', groupId: 'missing' }, destination: 'graveyard' }];
    state.decks[0] = withSteps(steps) as ReturnType<typeof createEffectsDeck>;
    expect(validateAppState(state).ok).toBe(false);
    const result = unwrap(validateAppState(state, { dropDanglingSlots: true }));
    expect(result.droppedEffects).toBe(1);
    expect(result.state.decks[0].effects).toEqual([]);
  });

  it('復元でも不正な型・枚数・重複を削除で隠さず拒否する', () => {
    const state = createEffectsState();
    state.decks[0].patterns[0].conditions = [{ kind: 'deckAtLeast', target: { type: 'group', groupId: 'missing' }, count: 0 }];
    expect(validateAppState(state, { dropDanglingSlots: true }).ok).toBe(false);
    state.decks[0].patterns[0].conditions = [];
    state.decks[0].effects[0].steps = [{ kind: 'excavate', count: 0, target: { type: 'group', groupId: 'missing' } }];
    expect(validateAppState(state, { dropDanglingSlots: true }).ok).toBe(false);
    state.decks[0].effects[0].steps = [{ kind: 'search', target: { type: 'group', groupId: 'missing' } }];
    state.decks[0].effects.push(structuredClone(state.decks[0].effects[0]));
    expect(validateAppState(state, { dropDanglingSlots: true }).ok).toBe(false);
  });
});
