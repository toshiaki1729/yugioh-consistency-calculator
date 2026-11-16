import { MAX_MAIN_FILL_TARGET } from './limits';

/** メインデッキを目標枚数まで補う、初動に関係しないカードの枚数を返す。 */
export function getMainFillCount(mainCount: number, target: number | undefined): number {
  if (target === undefined || mainCount >= target || mainCount > MAX_MAIN_FILL_TARGET) return 0;
  return target - mainCount;
}
