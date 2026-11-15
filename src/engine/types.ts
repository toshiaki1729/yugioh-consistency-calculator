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
}

/** 同時に満たすスロットの組。 */
export interface EnginePattern {
  id: string;
  slots: EngineSlot[];
}

/** Worker に渡すカードクラス集約済みの計算入力。 */
export interface EngineInput {
  deckSize: number;
  classes: { key: string; count: number }[];
  otherCount: number;
  patterns: EnginePattern[];
  handSizes: number[];
  limits: EngineLimits;
}

/** 確率と計算方式、および推定精度の情報。 */
export interface Estimate {
  p: number;
  method: 'exact' | 'sampling';
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
