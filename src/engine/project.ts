import type { EngineInput, EnginePattern, EngineSlot } from './types';

/** 単一パターンに必要なクラスだけを再集約する。 */
export function project(input: EngineInput, pattern: EnginePattern): EngineInput {
  const classes: EngineInput['classes'] = [];
  const indices = new Map<string, number>();
  const classIndices = new Map<number, number>();
  const slots: EngineSlot[] = pattern.slots.map(slot => ({
    count: slot.count, distinct: slot.distinct, members: [],
  }));
  const conditions = pattern.conditions.map(condition => ({
    ...condition, members: [] as number[],
  }));
  let otherCount = input.otherCount;
  for (let i = 0; i < input.classes.length; i++) {
    const membership: number[] = [];
    let hasDistinctSlot = false;
    for (let j = 0; j < pattern.slots.length; j++) {
      const slot = pattern.slots[j];
      if (slot.members.includes(i)) {
        membership.push(j);
        hasDistinctSlot ||= slot.distinct;
      }
    }
    const conditionMembership: number[] = [];
    for (let j = 0; j < pattern.conditions.length; j++) {
      if (pattern.conditions[j].members.includes(i)) conditionMembership.push(j);
    }
    const source = input.classes[i];
    if (membership.length === 0 && conditionMembership.length === 0) {
      otherCount += source.count;
      continue;
    }
    // このパターンに種類違い指定がなければ、他パターン用の単独クラスもまとめられる。
    let key = `slots:${membership.join(',')}`;
    if (conditionMembership.length > 0) key += `|conds:${conditionMembership.join(',')}`;
    if (hasDistinctSlot) key = `class:${i}:${source.key}`;
    const existing = indices.get(key);
    if (existing !== undefined) {
      classes[existing].count += source.count;
    } else {
      const index = classes.length;
      indices.set(key, index);
      classes.push({ key, count: source.count });
      for (const j of membership) slots[j].members.push(index);
      for (const j of conditionMembership) conditions[j].members.push(index);
    }
    classIndices.set(i, indices.get(key)!);
  }
  remapDistinctGroups(pattern.slots, slots, classIndices);
  return {
    ...input,
    classes,
    otherCount,
    patterns: [{ id: pattern.id, slots, conditions }],
    ...(input.impossiblePatternIds ? { impossiblePatternIds: [] } : {}),
  };
}

function remapDistinctGroups(
  sources: EngineSlot[], slots: EngineSlot[], classIndices: Map<number, number>,
) {
  for (let i = 0; i < sources.length; i++) {
    const groups = sources[i].distinctGroups;
    if (!groups || !sources[i].distinct) continue;
    const mapped = groups.map(group => group.map(index => classIndices.get(index)!));
    if (mapped.some(group => group.length > 1)) slots[i].distinctGroups = mapped;
  }
}
