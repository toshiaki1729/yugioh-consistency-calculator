export interface EngineLimits {
  exactMaxStates: number;
  samples: number;
  seed: number;
}

export const DEFAULT_LIMITS: Readonly<EngineLimits> = {
  exactMaxStates: 2_000_000,
  samples: 200_000,
  seed: 0x12345678,
};

export interface EngineSlot {
  count: number;
  distinct: boolean;
  members: number[];
}

export interface EnginePattern {
  id: string;
  slots: EngineSlot[];
}

export interface EngineInput {
  deckSize: number;
  classes: { key: string; count: number }[];
  otherCount: number;
  patterns: EnginePattern[];
  handSizes: number[];
  limits: EngineLimits;
}

export interface Estimate {
  p: number;
  method: 'exact' | 'sampling';
  lo?: number;
  hi?: number;
  states?: number;
  samples?: number;
}

export interface HandResult {
  handSize: number;
  success: Estimate;
  perPattern: Record<string, Estimate>;
  elapsedMs: number;
}

export type ProgressCallback = (done: number, total: number) => void;

export interface ExactResult {
  estimate: Estimate;
  weightSum: number;
}
