import type { AppState, CardTarget, Deck } from '../../domain/types';
import { APP_SCHEMA_VERSION, MAX_TITLE_LENGTH } from '../../domain/limits';
import type { StateDependencies } from './types';

const COPY_SUFFIX = 'のコピー';

/** 文字数上限内に収まる複製名を作る。 */
export function createCopyName(name: string): string {
  return name.slice(0, MAX_TITLE_LENGTH - COPY_SUFFIX.length) + COPY_SUFFIX;
}

/** 空のデッキを作り、ID と更新時刻を付ける。 */
export function createEmptyDeck(
  { newId = () => crypto.randomUUID(), now = Date.now }: StateDependencies = {},
  name = '新しいデッキ',
): Deck {
  return {
    id: newId(), name, entries: [], groups: [], patterns: [], effects: [],
    customCards: [], pageData: {}, updatedAt: now(),
  };
}

/** 初回起動時のアプリ状態を作る。 */
export function createInitialState(dependencies: StateDependencies = {}): AppState {
  const deck = createEmptyDeck(dependencies);
  return {
    schemaVersion: APP_SCHEMA_VERSION, decks: [deck], activeDeckId: deck.id,
    settings: { customHandSize: null },
  };
}

/** カード ID を保ち、デッキ内の編集対象と参照先の ID を振り直す。 */
export function copyDeckWithNewIds(deck: Deck, newId: () => string): Deck {
  const copy = structuredClone(deck);
  copy.id = newId();
  const groupIds = new Map<string, string>();
  for (const group of copy.groups) {
    const id = newId();
    groupIds.set(group.id, id);
    group.id = id;
  }
  function remapTarget(target: CardTarget): CardTarget {
    // 共有されている対象に ID の振り直しが二重にかからないよう置き換える。
    return target.type === 'group'
      ? { ...target, groupId: groupIds.get(target.groupId)! } : { ...target };
  }
  for (const pattern of copy.patterns) {
    pattern.id = newId();
    for (const slot of pattern.slots) {
      slot.id = newId();
      slot.source = remapTarget(slot.source);
    }
    for (const condition of pattern.conditions) {
      condition.target = remapTarget(condition.target);
    }
  }
  for (const effect of copy.effects) {
    effect.id = newId();
    for (const step of effect.steps) {
      if (!('target' in step) || step.target === null) continue;
      step.target = remapTarget(step.target);
    }
  }
  return copy;
}

