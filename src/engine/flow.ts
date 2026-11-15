import type { EnginePattern } from './types';

export function createHandMatcher(patterns: EnginePattern[], handSize: number): (hand: Uint8Array) => boolean {
  const matchers = patterns.map(pattern => {
    const demand = pattern.slots.reduce((sum, slot) => sum + slot.count, 0);
    if (demand > handSize || pattern.slots.length === 0) return () => false;
    if (pattern.slots.length === 1) {
      const slot = pattern.slots[0];
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

    return (hand: Uint8Array) => {
      let available = 0;
      for (let i = 0; i < members.length; i++) available += hand[members[i]];
      if (available < demand) return false;
      for (const slot of pattern.slots) {
        let slotAvailable = 0;
        for (let i = 0; i < slot.members.length; i++) {
          const count = hand[slot.members[i]];
          slotAvailable += slot.distinct ? Number(count > 0) : count;
        }
        if (slotAvailable < slot.count) return false;
      }

      residual.set(base);
      for (let i = 0; i < members.length; i++) residual[sinkEdges[i]] = hand[members[i]];
      let flow = 0;
      while (flow < demand) {
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
        if (parent[sink] === -1) return false;
        let amount = demand - flow;
        for (let node = sink; node !== 0; node = to[parent[node] ^ 1]) {
          amount = Math.min(amount, residual[parent[node]]);
        }
        for (let node = sink; node !== 0; node = to[parent[node] ^ 1]) {
          const edge = parent[node];
          residual[edge] -= amount;
          residual[edge ^ 1] += amount;
        }
        flow += amount;
      }
      return true;
    };
  });
  return hand => {
    for (let i = 0; i < matchers.length; i++) {
      if (matchers[i](hand)) return true;
    }
    return false;
  };
}
