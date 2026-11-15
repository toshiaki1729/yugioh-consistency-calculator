import type { EnginePattern, EngineSlot } from './types';

/** 手札が有効なパターンのいずれかを満たすか判定する。 */
export function createHandMatcher(
  patterns: (EnginePattern & { conditions: [] })[], handSize: number,
): (hand: Uint8Array) => boolean;
/** 残数条件を含むパターンをクラスの総枚数と照合する。 */
export function createHandMatcher(
  patterns: EnginePattern[], handSize: number, classCounts: ArrayLike<number>,
): (hand: Uint8Array) => boolean;
/** 条件のない呼び出しではクラスの総枚数を省略できる。 */
export function createHandMatcher(
  patterns: EnginePattern[], handSize: number, classCounts: ArrayLike<number> = [],
): (hand: Uint8Array) => boolean {
  const matchers = patterns.map(pattern => createPatternMatcher(pattern, handSize, classCounts));
  return hand => {
    for (let i = 0; i < matchers.length; i++) {
      if (matchers[i](hand)) return true;
    }
    return false;
  };
}

function createSingleSlotMatcher(slot: EngineSlot) {
  const members = Int32Array.from(slot.members);
  return (hand: Uint8Array) => {
    let available = 0;
    for (let i = 0; i < members.length; i++) {
      const count = hand[members[i]];
      available += slot.distinct ? Number(count > 0) : count;
      if (available >= slot.count) return true;
    }
    return false;
  };
}

function hasSlotCapacity(slots: EngineSlot[], hand: Uint8Array) {
  for (const slot of slots) {
    let available = 0;
    for (let i = 0; i < slot.members.length; i++) {
      const count = hand[slot.members[i]];
      available += slot.distinct ? Number(count > 0) : count;
    }
    if (available < slot.count) return false;
  }
  return true;
}

function createFlowNetwork(pattern: EnginePattern, demand: number) {

  const members = Int32Array.from(new Set(pattern.slots.flatMap(slot => slot.members)));
  const slotCount = pattern.slots.length;
  const sink = 1 + slotCount + members.length;
  const heads = new Int32Array(sink + 1).fill(-1);
  const targets: number[] = [];
  const next: number[] = [];
  const capacities: number[] = [];
  const sinkEdges = new Int32Array(members.length);
  const classNodes = new Map(Array.from(members, (index, i) => [index, 1 + slotCount + i]));
  const addEdge = (from: number, to: number, capacity: number) => {
    const edge = targets.length;
    targets.push(to, from);
    next.push(heads[from], heads[to]);
    capacities.push(capacity, 0);
    heads[from] = edge;
    heads[to] = edge + 1;
    return edge;
  };
  for (let j = 0; j < slotCount; j++) {
    const slot = pattern.slots[j];
    addEdge(0, 1 + j, slot.count);
    for (const member of slot.members) {
      addEdge(1 + j, classNodes.get(member)!, slot.distinct ? 1 : demand);
    }
  }
  for (let i = 0; i < members.length; i++) sinkEdges[i] = addEdge(1 + slotCount + i, sink, 0);
  const to = Int32Array.from(targets);
  const links = Int32Array.from(next);
  const base = Uint8Array.from(capacities);
  const residual = new Uint8Array(base.length);
  const parent = new Int32Array(sink + 1);
  const queue = new Int32Array(sink + 1);

  function findAugmentingPath() {
    parent.fill(-1);
    parent[0] = -2;
    queue[0] = 0;
    let read = 0;
    let write = 1;
    while (read < write && parent[sink] === -1) {
      const node = queue[read++];
      for (let edge = heads[node]; edge !== -1; edge = links[edge]) {
        const target = to[edge];
        if (residual[edge] === 0 || parent[target] !== -1) continue;
        parent[target] = edge;
        queue[write++] = target;
        if (target === sink) break;
      }
    }
    return parent[sink] !== -1;
  }

  function augmentFlow(remaining: number) {
    let amount = remaining;
    for (let node = sink; node !== 0; node = to[parent[node] ^ 1]) {
      amount = Math.min(amount, residual[parent[node]]);
    }
    for (let node = sink; node !== 0; node = to[parent[node] ^ 1]) {
      const edge = parent[node];
      residual[edge] -= amount;
      residual[edge ^ 1] += amount;
    }
    return amount;
  }

  return (hand: Uint8Array) => {
    let available = 0;
    for (let i = 0; i < members.length; i++) available += hand[members[i]];
    if (available < demand) return false;
    if (!hasSlotCapacity(pattern.slots, hand)) return false;

    residual.set(base);
    for (let i = 0; i < members.length; i++) residual[sinkEdges[i]] = hand[members[i]];
    let flow = 0;
    while (flow < demand) {
      if (!findAugmentingPath()) return false;
      flow += augmentFlow(demand - flow);
    }
    return true;
  };
}

function createPatternMatcher(
  pattern: EnginePattern, handSize: number, classCounts: ArrayLike<number>,
) {
  const demand = pattern.slots.reduce((sum, slot) => sum + slot.count, 0);
  if (demand > handSize) return () => false;
  let matchesSlots: (hand: Uint8Array) => boolean = () => true;
  if (pattern.slots.length === 1) matchesSlots = createSingleSlotMatcher(pattern.slots[0]);
  if (pattern.slots.length > 1) matchesSlots = createFlowNetwork(pattern, demand);
  if (pattern.conditions.length === 0) return matchesSlots;
  const conditions = pattern.conditions.map(condition => ({
    members: Int32Array.from(condition.members),
    maxDrawn: condition.members.reduce((sum, index) => sum + classCounts[index], 0)
      - condition.minRemaining,
  }));
  return (hand: Uint8Array) => {
    for (const condition of conditions) {
      let drawn = 0;
      for (let i = 0; i < condition.members.length; i++) drawn += hand[condition.members[i]];
      if (drawn > condition.maxDrawn) return false;
    }
    return matchesSlots(hand);
  };
}
