import { describe, expect, it } from 'vitest';
import type { CardTarget, Deck, EffectStep, PatternCondition } from '../src/domain/types';
import { validateDeck } from '../src/domain/validate';
import { createReducer } from '../src/state/reducer';
import { exportDeckJson, importDeckJson } from '../src/state/persist';
import {
  createEffect, createEffectsState, groupTarget, unwrap,
} from './fixtures/effectsDeck';

function conditionsFor(target: CardTarget): PatternCondition[] {
  const conditions: PatternCondition[] = [
    { kind: 'deckAtLeast', target, count: 1 },
    { kind: 'deckAfterBanish', target, count: 1, banish: 3 },
    { kind: 'movedIncludes', target, zones: ['banishedFaceUp'] },
    { kind: 'movedExcludes', target, zones: ['graveyard', 'banishedFaceDown'] },
  ];
  return conditions.map(condition => structuredClone(condition));
}

function addReferences(deck: Deck, target: CardTarget) {
  const retainedTarget: CardTarget = { type: 'group', groupId: 'g2' };
  deck.groups.push({ ...structuredClone(deck.groups[0]), id: 'g2', name: '残すグループ' });
  deck.patterns[0].conditions = [...conditionsFor(target), ...conditionsFor(retainedTarget)];
  deck.patterns[0].slots = [
    { id: 's1', source: structuredClone(target), count: 1, distinctNames: false },
    { id: 's2', source: structuredClone(retainedTarget), count: 1, distinctNames: false },
  ];
  const steps: EffectStep[] = [
    { kind: 'search', target },
    { kind: 'excavate', count: 3, target },
    { kind: 'handCost', destination: 'banishedFaceUp', target },
  ];
  deck.effects = steps.map((step, index) => ({
    ...createEffect(), id: `e${index}`, cardId: `k${index + 10}`,
    steps: [{ kind: 'draw', count: 1 }, structuredClone(step)],
  }));
  deck.effects.push({
    ...createEffect(), id: 'retained', cardId: 'k20',
    steps: [
      { kind: 'draw', count: 1 }, { kind: 'banishTop', count: 1 },
      { kind: 'excavate', count: 2, target: null },
      { kind: 'search', target: retainedTarget },
      { kind: 'handCost', target: { type: 'card', cardId: 'k99' }, destination: 'graveyard' },
    ],
  });
}

describe('条件・効果の削除連動', () => {
  it('グループ参照のある条件と効果全体だけを削除し、元の状態は保持する', () => {
    const app = createEffectsState();
    addReferences(app.decks[0], groupTarget);
    const before = structuredClone(app);
    const result = createReducer()({ app, lastError: null }, { type: 'group/delete', groupId: 'g1' });
    expect(result.lastError).toBeNull();
    const deck = result.app.decks[0];
    expect(deck.groups.map(group => group.id)).toEqual(['g2']);
    expect(deck.patterns[0].conditions).toEqual(before.decks[0].patterns[0].conditions.slice(4));
    expect(deck.patterns[0].slots).toEqual([before.decks[0].patterns[0].slots[1]]);
    expect(deck.effects).toEqual([before.decks[0].effects[3]]);
    expect(app).toEqual(before);
  });

  it('カスタムカード参照の条件・手順・効果カード自身を削除する', () => {
    const app = createEffectsState();
    const deck = app.decks[0];
    const cardId = 'c:custom';
    addReferences(deck, { type: 'card', cardId });
    deck.customCards = [{ id: cardId, name: 'カスタム', kind: 'spell', monsterTypes: [], text: '', custom: true }];
    deck.entries.push({ cardId, name: 'カスタム', section: 'main', count: 1 });
    deck.groups[0].include = [cardId, 'k1'];
    deck.groups[0].exclude = [cardId];
    deck.groups[0].filter = { op: 'pred', pred: { kind: 'cards', cardIds: [cardId, 'k1'] } };
    deck.effects.push({ ...createEffect(), id: 'own', cardId });
    const before = structuredClone(app);
    const result = createReducer()({ app, lastError: null }, { type: 'customCard/delete', cardId });
    expect(result.lastError).toBeNull();
    const updated = result.app.decks[0];
    expect(updated.customCards).toEqual([]);
    expect(updated.entries).toEqual([before.decks[0].entries[0]]);
    expect(updated.groups[0]).toMatchObject({
      include: ['k1'], exclude: [], filter: { op: 'pred', pred: { kind: 'cards', cardIds: ['k1'] } },
    });
    expect(updated.patterns[0].conditions).toEqual(before.decks[0].patterns[0].conditions.slice(4));
    expect(updated.patterns[0].slots).toEqual([before.decks[0].patterns[0].slots[1]]);
    expect(updated.effects).toEqual([before.decks[0].effects[3]]);
    expect(app).toEqual(before);
  });

  it('メインデッキのエントリだけを削除した場合はドロー効果を保持する', () => {
    const app = createEffectsState();
    const result = createReducer()({ app, lastError: null }, {
      type: 'entry/delete', cardId: 'k1', section: 'main',
    });
    expect(result.lastError).toBeNull();
    expect(result.app.decks[0].entries).toEqual([]);
    expect(result.app.decks[0].effects).toEqual(app.decks[0].effects);
  });
});

describe('デッキ複製とJSON読み込み', () => {
  it.each(['duplicate', 'json'] as const)('%s は2グループの参照と全編集対象のIDを振り直す', mode => {
    const app = createEffectsState();
    const original = app.decks[0];
    addReferences(original, groupTarget);
    original.effects[3].steps[2] = { kind: 'excavate', count: 2, target: { type: 'group', groupId: 'g2' } };
    const before = structuredClone(app);
    let next = 0;
    const newId = () => `new-${++next}`;
    const reduce = createReducer({ newId, now: () => 42 });
    const action = mode === 'duplicate' ? { type: 'deck/duplicate' as const }
      : { type: 'deck/import' as const, deck: unwrap(importDeckJson(exportDeckJson(original), newId)) };
    const result = reduce({ app, lastError: null }, action);
    expect(result.lastError).toBeNull();
    expect(result.app.decks).toHaveLength(2);
    const copy = result.app.decks[1];
    expect(result.app.activeDeckId).toBe(copy.id);
    const oldIds = [original.id, ...original.groups.map(group => group.id),
      ...original.patterns.map(pattern => pattern.id), ...original.patterns[0].slots.map(slot => slot.id),
      ...original.effects.map(effect => effect.id)];
    const newIds = [copy.id, ...copy.groups.map(group => group.id),
      ...copy.patterns.map(pattern => pattern.id), ...copy.patterns[0].slots.map(slot => slot.id),
      ...copy.effects.map(effect => effect.id)];
    expect(new Set(newIds).size).toBe(newIds.length);
    expect(newIds.every(id => !oldIds.includes(id))).toBe(true);
    const targets = copy.groups.map(group => ({ type: 'group', groupId: group.id } as const));
    expect(copy.patterns[0].conditions).toEqual([...conditionsFor(targets[0]), ...conditionsFor(targets[1])]);
    expect(copy.patterns[0].slots.map(slot => slot.source)).toEqual(targets);
    expect(copy.effects.slice(0, 3).map(effect => effect.steps[1])).toEqual([
      { kind: 'search', target: targets[0] },
      { kind: 'excavate', count: 3, target: targets[0] },
      { kind: 'handCost', destination: 'banishedFaceUp', target: targets[0] },
    ]);
    expect(copy.effects[3].steps[2]).toEqual({ kind: 'excavate', count: 2, target: targets[1] });
    expect(copy.effects[3].steps[3]).toEqual({ kind: 'search', target: targets[1] });
    expect(copy.effects[3].steps[4]).toEqual(original.effects[3].steps[4]);
    expect(copy.effects.map(effect => effect.cardId)).toEqual(original.effects.map(effect => effect.cardId));
    expect(copy.entries).toEqual(original.entries);
    expect(validateDeck(copy).ok).toBe(true);
    expect(app).toEqual(before);
    expect(result.app.decks[0]).toEqual(original);
  });
});
