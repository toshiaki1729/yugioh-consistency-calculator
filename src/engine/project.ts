import type { EngineInput, EnginePattern } from './types';

/** 単一パターンに必要なクラスだけを再集約する。 */
export function project(input: EngineInput, pattern: EnginePattern): EngineInput {
  const classes: EngineInput['classes'] = [];
  const indices = new Map<string, number>();
  const slots = pattern.slots.map(slot => ({ ...slot, members: [] as number[] }));
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
    const source = input.classes[i];
    if (membership.length === 0) {
      otherCount += source.count;
      continue;
    }
    // このパターンに種類違い指定がなければ、他パターン用の単独クラスもまとめられる。
    const key = hasDistinctSlot ? `class:${i}:${source.key}` : `slots:${membership.join(',')}`;
    const existing = indices.get(key);
    if (existing !== undefined) {
      classes[existing].count += source.count;
    } else {
      const index = classes.length;
      indices.set(key, index);
      classes.push({ key, count: source.count });
      for (const j of membership) slots[j].members.push(index);
    }
  }
  return {
    ...input,
    classes,
    otherCount,
    patterns: [{ id: pattern.id, slots }],
  };
}
