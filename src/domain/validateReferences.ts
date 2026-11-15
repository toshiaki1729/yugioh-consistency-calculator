import { failValidation } from './decoder';
import type {
  CardTarget, Deck, DrawEffect, Pattern, PatternCondition, Result, Slot,
} from './types';

/** 復元時に参照切れのため削除した項目の件数。 */
export interface DroppedReferences {
  droppedSlots: number;
  droppedConditions: number;
  droppedEffects: number;
}

function findMissingGroup(target: CardTarget | null, groupIds: Set<string>): string | undefined {
  if (target?.type === 'group' && !groupIds.has(target.groupId)) return target.groupId;
}

function checkConditionReferences(
  pattern: Pattern, groupIds: Set<string>, location: string, shouldDrop: boolean,
): Result<number> {
  const conditions: PatternCondition[] = [];
  for (let i = 0; i < pattern.conditions.length; i++) {
    const condition = pattern.conditions[i];
    const missing = findMissingGroup(condition.target, groupIds);
    if (missing === undefined) conditions.push(condition);
    else if (!shouldDrop) return failValidation(
      `${location}のパターン『${pattern.name}』の追加の条件 ${i + 1}`,
      `参照先のグループ『${missing}』がありません`,
    );
  }
  const dropped = pattern.conditions.length - conditions.length;
  pattern.conditions = conditions;
  return { ok: true, value: dropped };
}

function checkEffectReferences(
  deck: Deck, groupIds: Set<string>, location: string, shouldDrop: boolean,
): Result<number> {
  const effects: DrawEffect[] = [];
  for (const effect of deck.effects) {
    const index = effect.steps.findIndex(step =>
      'target' in step && findMissingGroup(step.target, groupIds) !== undefined);
    if (index < 0) effects.push(effect);
    else if (!shouldDrop) return failValidation(
      `${location}のドロー効果『${effect.id}』の手順 ${index + 1}`,
      '参照先のグループがありません',
    );
  }
  const dropped = deck.effects.length - effects.length;
  deck.effects = effects;
  return { ok: true, value: dropped };
}

/** デッキ内のグループ参照を検証し、復元時だけ参照切れの項目を除く。 */
export function checkDeckReferences(
  deck: Deck, groupIds: Set<string>, location: string, shouldDrop: boolean,
): Result<DroppedReferences> {
  let droppedSlots = 0;
  let droppedConditions = 0;
  for (const pattern of deck.patterns) {
    const slots = checkSlotReferences(pattern, groupIds, location, shouldDrop);
    if (!slots.ok) return slots;
    droppedSlots += slots.value;
    const conditions = checkConditionReferences(pattern, groupIds, location, shouldDrop);
    if (!conditions.ok) return conditions;
    droppedConditions += conditions.value;
  }
  const effects = checkEffectReferences(deck, groupIds, location, shouldDrop);
  if (!effects.ok) return effects;
  return { ok: true, value: { droppedSlots, droppedConditions, droppedEffects: effects.value } };
}

function checkSlotReferences(
  pattern: Pattern, groupIds: Set<string>, location: string, shouldDropDanglingSlots: boolean,
): Result<number> {
  const slots: Slot[] = [];
  let droppedSlots = 0;
  for (const candidate of pattern.slots) {
    if (candidate.source.type !== 'group' || groupIds.has(candidate.source.groupId)) {
      slots.push(candidate);
      continue;
    }
    if (!shouldDropDanglingSlots) return failValidation(
      `${location}のパターン『${pattern.name}』のスロット『${candidate.id}』`,
      `参照先のグループ『${candidate.source.groupId}』がありません`,
    );
    droppedSlots++;
  }
  pattern.slots = slots;
  return { ok: true, value: droppedSlots };
}

