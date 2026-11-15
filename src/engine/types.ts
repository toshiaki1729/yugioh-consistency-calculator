import type { SimulationInput } from './simulateTypes';

/** 計算方式に対応した、Worker に渡す入力。 */
export type CalculationInput =
  | { mode: 'classes'; input: EngineInput }
  | { mode: 'simulation'; input: SimulationInput };

/** 計算方式の切り替えとサンプリングの設定。 */
export interface EngineLimits {
  exactMaxStates: number;
  samples: number;
  seed: number;
}

/** 計算量と再現性を保つための既定設定。 */
export const DEFAULT_LIMITS: Readonly<EngineLimits> = {
  exactMaxStates: 2_000_000,
  samples: 200_000,
  seed: 0x12345678,
};

/** 計算用クラスに対する必要枚数と種類違いの条件。 */
export interface EngineSlot {
  count: number;
  distinct: boolean;
  members: number[];
  /** 同じ名前の所属クラスのまとまり。省略時は各クラスを別名として扱う。 */
  distinctGroups?: number[][];
}

/** デッキに残す対象クラスと必要枚数。 */
export interface EngineCondition {
  members: number[];
  minRemaining: number;
}

/** 同時に満たすスロットとデッキの残数条件。 */
export interface EnginePattern {
  id: string;
  slots: EngineSlot[];
  conditions: EngineCondition[];
}

/** Worker に渡すカードクラス集約済みの計算入力。 */
export interface EngineInput {
  deckSize: number;
  classes: { key: string; count: number }[];
  otherCount: number;
  patterns: EnginePattern[];
  /** 計算対象から除いた、ドロー効果なしでは常に不成立のパターン。 */
  impossiblePatternIds?: string[];
  handSizes: number[];
  limits: EngineLimits;
}

/** 確率と計算方式、および推定精度の情報。 */
export interface Estimate {
  p: number;
  method: 'exact' | 'sampling' | 'simulation';
  lo?: number;
  hi?: number;
  states?: number;
  samples?: number;
}

/** 一つの手札枚数に対する全体とパターン別の結果。 */
export interface HandResult {
  handSize: number;
  success: Estimate;
  perPattern: Record<string, Estimate>;
  elapsedMs: number;
}

/** 計算済みの仕事量と総仕事量を通知する関数。 */
export type ProgressCallback = (done: number, total: number) => void;

/** 厳密確率と列挙した手札の重み合計。 */
export interface ExactResult {
  estimate: Estimate;
  weightSum: number;
}
