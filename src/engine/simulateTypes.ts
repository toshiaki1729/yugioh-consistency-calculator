import type { MoveZone } from '../domain/types';
import type { EngineLimits, EngineSlot } from './types';

/** カード番号に解決済みの、Worker に渡せるシミュレーション入力。 */
export interface SimulationInput {
  cards: { key: string; count: number }[];
  patterns: SimulationPattern[];
  effects: SimulationEffect[];
  handSizes: number[];
  limits: EngineLimits;
}

/** 手札のスロットと追加条件を同時に満たす目標。 */
export interface SimulationPattern {
  id: string;
  slots: EngineSlot[];
  conditions: SimulationCondition[];
}

/** 残りのデッキまたは効果による移動を調べる条件。 */
export type SimulationCondition =
  | { kind: 'deckAtLeast'; members: number[]; count: number }
  | { kind: 'movedIncludes' | 'movedExcludes'; zones: MoveZone[]; members: number[] }
  | { kind: 'deckAfterBanish'; banish: number; members: number[]; count: number };

/** 優先順に使う、カード番号に対応する効果。 */
export interface SimulationEffect {
  card: number;
  oncePerTurn: boolean;
  firstOnly: boolean;
  drawLock: 'none' | 'after' | 'turn';
  steps: SimulationStep[];
}

/** 対象をカード番号に解決した効果の手順。 */
export type SimulationStep =
  | { kind: 'draw'; count: number }
  | { kind: 'banishTop'; count: number }
  | { kind: 'excavate'; count: number; members: number[] | null }
  | { kind: 'search'; members: number[] }
  | { kind: 'handCost'; members: number[]; destination: 'graveyard' | 'banishedFaceUp' };

/** 入力のパターン順で返す、全体と単独目標の最終判定。 */
export interface TrialResult {
  overall: boolean;
  perPattern: boolean[];
}

/** 呼ぶたびに同じ乱数列の先頭から始まる乱数源を作る。 */
export type CreateTrialRandom = () => (() => number);
