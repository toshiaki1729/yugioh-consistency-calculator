/** 32 ビットの符号なし整数を確率に変換する分母。 */
export const UINT32_RANGE = 4294967296;

/** 指定シードから再現可能な [0, 1) の乱数列を生成する。 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };
}
