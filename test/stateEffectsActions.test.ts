import { describe, expect, it } from 'vitest';
import type { DrawEffect, PatternCondition } from '../src/domain/types';
import {
  MAX_DRAW_EFFECTS, MAX_EFFECT_STEPS, MAX_PATTERN_CONDITIONS,
} from '../src/domain/limits';
import { createReducer } from '../src/state/reducer';
import type { Action, ReducerState } from '../src/state/reducer';
import { createEffect, createEffectsState, groupTarget } from './fixtures/effectsDeck';

function setup() {
  let next = 0;
  const reduce = createReducer({ newId: () => `new-${++next}`, now: () => 123 });
  const state: ReducerState = { app: createEffectsState(), lastError: null };
  return { reduce, state };
}

const condition: PatternCondition = {
  kind: 'movedIncludes', target: { type: 'card', cardId: 'k2' }, zones: ['banishedFaceUp'],
};
const effect: Omit<DrawEffect, 'id'> = {
  cardId: 'k2', oncePerTurn: true, firstOnly: false, drawLock: 'none',
  steps: [{ kind: 'search', target: groupTarget }],
};

function expectRejected(state: ReducerState, action: Action, error?: string) {
  const { reduce } = setup();
  const before = structuredClone(state);
  const result = reduce(state, action);
  expect(result.app).toBe(state.app);
  expect(result.lastError).toBeTruthy();
  if (error) expect(result.lastError).toBe(error);
  expect(state).toEqual(before);
}

describe('追加の条件のアクション', () => {
  it('追加・種類を変える編集・削除を行い、元の状態と入力を変更しない', () => {
    const { reduce, state } = setup();
    const before = structuredClone(state);
    const added = reduce(state, { type: 'condition/add', patternId: 'p1', condition });
    expect(added.lastError).toBeNull();
    expect(added.app.decks[0].patterns[0].conditions).toEqual([
      ...before.app.decks[0].patterns[0].conditions, condition,
    ]);
    const edited = reduce(added, {
      type: 'condition/edit', patternId: 'p1', index: 0, condition,
    });
    expect(edited.lastError).toBeNull();
    expect(edited.app.decks[0].patterns[0].conditions).toEqual([condition, condition]);
    const deleted = reduce(edited, { type: 'condition/delete', patternId: 'p1', index: 1 });
    expect(deleted.lastError).toBeNull();
    expect(deleted.app.decks[0].patterns[0].conditions).toEqual([condition]);
    const emptied = reduce(deleted, { type: 'condition/delete', patternId: 'p1', index: 0 });
    expect(emptied.lastError).toBeNull();
    expect(emptied.app.decks[0].patterns[0].conditions).toEqual([]);
    expect(emptied.app.decks[0].updatedAt).toBe(123);
    expect(state).toEqual(before);
    expect(added.app.decks[0].patterns[0].conditions[1]).not.toBe(condition);
    expect(added.app.decks[0].patterns[0].conditions[0]).toEqual(
      before.app.decks[0].patterns[0].conditions[0],
    );
  });

  it.each(['condition/add', 'condition/edit', 'condition/delete'] as const)(
    '%s は存在しないパターンを拒否する', type => {
      expectRejected(setup().state, { type, patternId: 'missing', index: 0, condition },
        '対象のパターンがありません。');
    },
  );

  it.each([-1, 1, 100, 0.5, NaN, Infinity])('編集と削除は無効な位置 %s を拒否する', index => {
    for (const type of ['condition/edit', 'condition/delete'] as const) {
      expectRejected(setup().state, { type, patternId: 'p1', index, condition },
        '対象の条件がありません。');
    }
  });

  it('条件を8個まで追加でき、9個目は拒否する', () => {
    const { reduce, state } = setup();
    state.app.decks[0].patterns[0].conditions = Array.from(
      { length: MAX_PATTERN_CONDITIONS - 1 }, () => structuredClone(condition),
    );
    const full = reduce(state, { type: 'condition/add', patternId: 'p1', condition });
    expect(full.lastError).toBeNull();
    expect(full.app.decks[0].patterns[0].conditions).toHaveLength(MAX_PATTERN_CONDITIONS);
    expectRejected(full, { type: 'condition/add', patternId: 'p1', condition });
  });

  const invalidConditions: PatternCondition[] = [
    { kind: 'deckAtLeast', target: groupTarget, count: 0 },
    { kind: 'deckAtLeast', target: groupTarget, count: 61 },
    { kind: 'deckAtLeast', target: groupTarget, count: 1.5 },
    { kind: 'deckAfterBanish', target: groupTarget, count: 1, banish: 21 },
    { kind: 'movedExcludes', target: groupTarget, zones: [] },
    { kind: 'movedIncludes', target: groupTarget, zones: ['graveyard', 'graveyard'] },
    { kind: 'deckAtLeast', target: { type: 'group', groupId: 'missing' }, count: 1 },
    { kind: 'deckAtLeast', target: { type: 'card', cardId: '__proto__' }, count: 1 },
  ];
  it.each(invalidConditions)('追加と編集は不正な条件を拒否する: %j', invalid => {
    for (const type of ['condition/add', 'condition/edit'] as const) {
      expectRejected(setup().state, { type, patternId: 'p1', index: 0, condition: invalid });
    }
  });
});

describe('ドロー効果のアクション', () => {
  it('採番して追加し、編集・並べ替え・削除を行う', () => {
    const { reduce, state } = setup();
    const before = structuredClone(state);
    const added = reduce(state, { type: 'effect/add', effect });
    expect(added.lastError).toBeNull();
    expect(added.app.decks[0].effects).toEqual([createEffect(), { ...effect, id: 'new-1' }]);
    const changes: Partial<Omit<DrawEffect, 'id'>> = {
      cardId: 'k3', oncePerTurn: false, firstOnly: true, drawLock: 'turn',
      steps: [{ kind: 'excavate', count: 6, target: null }],
    };
    const edited = reduce(added, { type: 'effect/edit', effectId: 'new-1', changes });
    expect(edited.lastError).toBeNull();
    expect(edited.app.decks[0].effects[1]).toEqual({ ...effect, ...changes, id: 'new-1' });
    const reordered = reduce(edited, { type: 'effect/reorder', effectIds: ['new-1', 'e1'] });
    expect(reordered.lastError).toBeNull();
    expect(reordered.app.decks[0].effects).toEqual([...edited.app.decks[0].effects].reverse());
    const deleted = reduce(reordered, { type: 'effect/delete', effectId: 'e1' });
    expect(deleted.lastError).toBeNull();
    expect(deleted.app.decks[0].effects).toEqual([edited.app.decks[0].effects[1]]);
    expect(state).toEqual(before);
    expect(added.app.decks[0].effects[1].steps).not.toBe(effect.steps);
    expect(edited.app.decks[0].effects[1].steps).not.toBe(changes.steps);
    expect(added.app.decks[0].effects[1]).toEqual({ ...effect, id: 'new-1' });
  });

  it.each(['effect/edit', 'effect/delete'] as const)('%s は存在しないIDを拒否する', type => {
    expectRejected(setup().state, { type, effectId: 'missing', changes: effect },
      '対象のドロー効果がありません。');
  });

  it.each([[], ['e1'], ['e1', 'e1'], ['e1', 'missing'], ['e1', 'e2', 'missing']]
    .map(effectIds => ({ effectIds })))(
    '並べ替えは過不足・重複・未知のIDを拒否する: $effectIds', ({ effectIds }) => {
      const { state } = setup();
      state.app.decks[0].effects.push({ ...effect, id: 'e2' });
      expectRejected(state, { type: 'effect/reorder', effectIds },
        '並べ替えには、すべてのドロー効果 ID を重複なく指定してください。');
    },
  );

  it('効果が0個の場合は空の並べ替えを受け付ける', () => {
    const { reduce, state } = setup();
    state.app.decks[0].effects = [];
    expect(reduce(state, { type: 'effect/reorder', effectIds: [] }).lastError).toBeNull();
  });

  it('効果を30個まで追加でき、31個目は拒否する', () => {
    const { reduce, state } = setup();
    state.app.decks[0].effects = Array.from({ length: MAX_DRAW_EFFECTS - 1 }, (_, index) => ({
      ...createEffect(), id: `e${index}`, cardId: `k${index + 100}`,
    }));
    const full = reduce(state, { type: 'effect/add', effect });
    expect(full.lastError).toBeNull();
    expect(full.app.decks[0].effects).toHaveLength(MAX_DRAW_EFFECTS);
    expectRejected(full, { type: 'effect/add', effect: { ...effect, cardId: 'k3' } });
  });

  const invalidChanges: Partial<Omit<DrawEffect, 'id'>>[] = [
    { cardId: '__proto__' },
    { steps: [] },
    { steps: Array.from({ length: MAX_EFFECT_STEPS + 1 }, () => ({ kind: 'draw', count: 1 })) },
    { steps: [{ kind: 'draw', count: 0 }] },
    { steps: [{ kind: 'draw', count: 6 }] },
    { steps: [{ kind: 'banishTop', count: 21 }] },
    { steps: [{ kind: 'excavate', count: 11, target: null }] },
    { steps: [{ kind: 'search', target: { type: 'group', groupId: 'missing' } }] },
    { steps: [{ kind: 'handCost', target: { type: 'group', groupId: 'missing' }, destination: 'graveyard' }] },
  ];
  it.each(invalidChanges)('追加と編集は不正な効果を拒否する: %j', changes => {
    expectRejected(setup().state, { type: 'effect/add', effect: { ...effect, ...changes } });
    expectRejected(setup().state, { type: 'effect/edit', effectId: 'e1', changes });
  });

  it('効果のcardIdの重複を追加・編集とも拒否する', () => {
    const { state } = setup();
    expectRejected(state, { type: 'effect/add', effect: { ...effect, cardId: 'k1' } });
    state.app.decks[0].effects.push({ ...effect, id: 'e2' });
    expectRejected(state, { type: 'effect/edit', effectId: 'e2', changes: { cardId: 'k1' } });
  });

  it('採番された効果IDが重複する場合も状態を変えず拒否する', () => {
    const { state } = setup();
    const reduce = createReducer({ newId: () => 'e1' });
    const result = reduce(state, { type: 'effect/add', effect });
    expect(result.lastError).toBeTruthy();
    expect(result.app).toBe(state.app);
  });
});
