import type { SimulationInput, SimulationPattern } from '../../src/engine/simulateTypes';
import { DEFAULT_LIMITS } from '../../src/engine/types';

export const SIMULATION_PERF_CARD = {
  A: 0, B: 1, C: 2, G: 3, P: 4, T: 5, D: 6, OTHER: 7,
} as const;

export const SIMULATION_PERF_COUNTS = {
  A: 3, B: 3, C: 2, G: 3, P: 1, T: 2, D: 3, OTHER: 23,
} as const;

const { A, B, C, G, P, T, D } = SIMULATION_PERF_CARD;
const patternCards = [[A], [B], [C], [A, B], [A, C], [B, C], [A, D]];
const patterns: SimulationPattern[] = patternCards.map(members => ({
  id: members.map(card => Object.keys(SIMULATION_PERF_CARD)[card]).join('+'),
  slots: members.map(card => ({ members: [card], count: 1, distinct: false })),
  conditions: [],
}));
patterns.push(
  { id: 'A2', slots: [{ members: [A], count: 2, distinct: false }], conditions: [] },
  {
    id: 'B+C残存', slots: [{ members: [B], count: 1, distinct: false }],
    conditions: [{ kind: 'deckAtLeast', members: [C], count: 1 }],
  },
  {
    id: 'D表側除外', slots: [],
    conditions: [{ kind: 'movedIncludes', members: [D], zones: ['banishedFaceUp'] }],
  },
);

export const simulationPerfInput: SimulationInput = {
  cards: Object.entries(SIMULATION_PERF_CARD).map(([key, card]) => ({
    key: `k${card + 1}`, count: SIMULATION_PERF_COUNTS[key as keyof typeof SIMULATION_PERF_COUNTS],
  })),
  patterns,
  effects: [
    {
      card: G, oncePerTurn: false, firstOnly: false, drawLock: 'none',
      steps: [{ kind: 'draw', count: 1 }],
    },
    {
      card: P, oncePerTurn: true, firstOnly: false, drawLock: 'none',
      steps: [{ kind: 'banishTop', count: 10 }, { kind: 'draw', count: 2 }],
    },
    {
      card: T, oncePerTurn: false, firstOnly: false, drawLock: 'none',
      steps: [
        { kind: 'draw', count: 2 },
        { kind: 'handCost', members: [D], destination: 'banishedFaceUp' },
      ],
    },
  ],
  handSizes: [5, 6],
  limits: { ...DEFAULT_LIMITS },
};
