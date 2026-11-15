import type { AppState, Deck, DrawEffect, Result } from '../../src/domain/types';
import { createEmptyDeck } from '../../src/state/reducer';

export const groupTarget = { type: 'group', groupId: 'g1' } as const;
export const cardTarget = { type: 'card', cardId: 'k1' } as const;

export function createEffect(): DrawEffect {
  return {
    id: 'e1', cardId: 'k1', oncePerTurn: false, firstOnly: false, drawLock: 'none',
    steps: [{ kind: 'draw', count: 1 }],
  };
}

export function createEffectsDeck(): Deck {
  return {
    ...createEmptyDeck({ newId: () => 'd1', now: () => 0 }, '追加条件のテスト'),
    entries: [{ cardId: 'k1', name: 'カード', count: 3, section: 'main' }],
    groups: [{ id: 'g1', name: '対象', filter: { op: 'and', children: [] }, include: [], exclude: [] }],
    patterns: [{ id: 'p1', name: '条件だけ', enabled: true, slots: [],
      conditions: [{ kind: 'deckAtLeast', target: groupTarget, count: 1 }] }],
    effects: [createEffect()],
  };
}

export function createEffectsState(): AppState {
  return {
    schemaVersion: 2, decks: [createEffectsDeck()], activeDeckId: 'd1',
    settings: { customHandSize: null },
  };
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
