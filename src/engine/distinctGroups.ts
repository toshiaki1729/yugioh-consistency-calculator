import type { Slot } from '../domain/types';
import type { EngineSlot } from './types';

/** 同名の所属カードがある場合だけ、種類違いのスロットに名前のまとまりを付ける。 */
export function compileSlot(
  slot: Pick<Slot, 'count' | 'distinctNames'>, members: number[],
  getNameKey: (index: number) => string,
): EngineSlot {
  const result: EngineSlot = { count: slot.count, distinct: slot.distinctNames, members };
  if (!slot.distinctNames) return result;
  const groups = new Map<string, number[]>();
  for (const member of members) {
    const key = getNameKey(member);
    const group = groups.get(key);
    if (group) group.push(member);
    else groups.set(key, [member]);
  }
  if (groups.size < members.length) result.distinctGroups = [...groups.values()];
  return result;
}
