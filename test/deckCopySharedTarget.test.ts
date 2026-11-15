import { describe, expect, it } from 'vitest';
import { copyDeckWithNewIds, createReducer } from '../src/state/reducer';
import { validateDeck } from '../src/domain/validate';
import { createEffectsState } from './fixtures/effectsDeck';

describe('対象オブジェクトを共有するデッキの複製', () => {
  it.each(['factory', 'reducer'] as const)('%s は共有された対象を新しいグループに対応させる', mode => {
    const app = createEffectsState();
    const original = app.decks[0];
    const target = { type: 'group', groupId: 'g1' } as const;
    original.patterns[0].slots = [
      { id: 's1', source: target, count: 1, distinctNames: false },
      { id: 's2', source: target, count: 1, distinctNames: false },
    ];
    original.patterns[0].conditions = [
      { kind: 'deckAtLeast', target, count: 1 },
      { kind: 'deckAfterBanish', target, count: 1, banish: 3 },
      { kind: 'movedIncludes', target, zones: ['graveyard'] },
      { kind: 'movedExcludes', target, zones: ['banishedFaceDown'] },
    ];
    original.effects[0].steps = [
      { kind: 'excavate', count: 3, target },
      { kind: 'search', target },
      { kind: 'handCost', destination: 'graveyard', target },
    ];
    const before = structuredClone(app);
    let next = 0;
    const newId = () => `new-${++next}`;
    let copy;
    if (mode === 'factory') {
      copy = copyDeckWithNewIds(original, newId);
    } else {
      const result = createReducer({ newId, now: () => 42 })(
        { app, lastError: null }, { type: 'deck/duplicate' },
      );
      expect(result.lastError).toBeNull();
      expect(result.app.decks).toHaveLength(2);
      copy = result.app.decks[1];
      expect(result.app.activeDeckId).toBe(copy.id);
    }
    expect(copy.groups[0].id).not.toBe(target.groupId);
    const remapped = { type: 'group', groupId: copy.groups[0].id };
    const copiedTargets = [
      ...copy.patterns[0].slots.map(slot => slot.source),
      ...copy.patterns[0].conditions.map(condition => condition.target),
      ...copy.effects[0].steps.map(step => 'target' in step ? step.target : undefined),
    ];
    expect(copiedTargets).toHaveLength(9);
    for (const copiedTarget of copiedTargets) expect(copiedTarget).toEqual(remapped);
    expect(validateDeck(copy).ok).toBe(true);
    expect(app).toEqual(before);
    expect(target).toEqual({ type: 'group', groupId: 'g1' });
    const originalTargets = [
      ...original.patterns[0].slots.map(slot => slot.source),
      ...original.patterns[0].conditions.map(condition => condition.target),
      ...original.effects[0].steps.map(step => 'target' in step ? step.target : undefined),
    ];
    for (const originalTarget of originalTargets) expect(originalTarget).toBe(target);
  });
});
