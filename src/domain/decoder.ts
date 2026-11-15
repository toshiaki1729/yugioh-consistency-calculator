import type { Result } from './types';

/** 未知の入力を検証し、型付きの値または項目別のエラーを返す。 */
export type Decoder<T> = (value: unknown, path: string) => Result<T>;
type Decoded<S> = { [K in keyof S]: S[K] extends Decoder<infer T> ? T : never };

/** 項目の場所を含む検証エラーを作る。 */
export function failValidation(path: string, reason: string): Result<never> {
  return { ok: false, error: `${path}: ${reason}` };
}

/** 配列と null を除くオブジェクトを読み取る。 */
export const decodeObject: Decoder<Record<string, unknown>> = (value, path) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ok: true, value: value as Record<string, unknown> }
    : failValidation(path, 'オブジェクトで指定してください');

/** 検証済みオブジェクトから定義された項目を読み取る。 */
export function readFields<S extends Record<string, Decoder<unknown>>>(
  fields: S, record: Record<string, unknown>, path: string,
): Result<Decoded<S>> {
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    const field = fields[key](record[key], `${path}.${key}`);
    if (!field.ok) return field;
    if (field.value !== undefined) output[key] = field.value;
  }
  return { ok: true, value: output as Decoded<S> };
}

/** 項目定義に沿ったオブジェクトのデコーダを作る。 */
export function createShapeDecoder<S extends Record<string, Decoder<unknown>>>(
  fields: S, hasName = false,
): Decoder<Decoded<S>> {
  return (value, path) => {
    const record = decodeObject(value, path);
    if (!record.ok) return record;
    if (hasName && typeof record.value.name === 'string') path += `『${record.value.name}』`;
    return readFields(fields, record.value, path);
  };
}

/** 文字数の範囲を検証するデコーダを作る。 */
export function createStringDecoder(min: number, max: number, label: string): Decoder<string> {
  return (value, path) => typeof value === 'string' && value.length >= min && value.length <= max
    ? { ok: true, value }
    : failValidation(path, `${label}は ${min}〜${max} 文字で指定してください`);
}

/** 空でない識別子を読み取る。 */
export const decodeId: Decoder<string> = (value, path) =>
  typeof value === 'string' && value.length > 0
    ? { ok: true, value } : failValidation(path, 'ID は空でない文字列で指定してください');
/** 真偽値を読み取る。 */
export const decodeBoolean: Decoder<boolean> = (value, path) => typeof value === 'boolean'
  ? { ok: true, value } : failValidation(path, '真偽値で指定してください');

/** 整数の範囲を検証するデコーダを作る。 */
export function createIntegerDecoder(min: number, max: number, label: string): Decoder<number> {
  return (value, path) => {
    const isValid = typeof value === 'number' && Number.isInteger(value)
      && value >= min && value <= max;
    return isValid
      ? { ok: true, value } : failValidation(path, `${label}は ${min}〜${max} の整数で指定してください`);
  };
}

/** 許可された値のデコーダを作る。 */
export function createChoiceDecoder<const T extends string | number>(
  values: readonly T[],
): Decoder<T> {
  return (value, path) => values.some(item => item === value)
    ? { ok: true, value: value as T }
    : failValidation(path, `値は ${values.join(' / ')} のいずれかで指定してください`);
}

/** 表示名の対応表を使って列挙値のデコーダを作る。 */
export function createEnumDecoder<T extends string>(labels: Record<T, string>): Decoder<T> {
  return createChoiceDecoder(Object.keys(labels) as T[]);
}

/** 省略できる項目のデコーダを作る。 */
export function allowUndefined<T>(decode: Decoder<T>): Decoder<T | undefined> {
  return (value, path) => value === undefined ? { ok: true, value } : decode(value, path);
}

/** null を許可するデコーダを作る。 */
export function allowNull<T>(decode: Decoder<T>): Decoder<T | null> {
  return (value, path) => value === null ? { ok: true, value } : decode(value, path);
}

/** 件数上限と各要素を検証するデコーダを作る。 */
export function createArrayDecoder<T>(decode: Decoder<T>, max = Infinity): Decoder<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) return failValidation(path, '配列で指定してください');
    if (value.length > max) return failValidation(path, `件数が上限（${max}）を超えています`);
    const output: T[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = decode(value[i], `${path} ${i + 1}`);
      if (!item.ok) return item;
      output.push(item.value);
    }
    return { ok: true, value: output };
  };
}

/** 件数上限・各要素・値の重複を検証するデコーダを作る。 */
export function createUniqueArrayDecoder<T>(decode: Decoder<T>, max: number): Decoder<T[]> {
  const decodeArray = createArrayDecoder(decode, max);
  return (value, path) => {
    const parsed = decodeArray(value, path);
    if (!parsed.ok) return parsed;
    return new Set(parsed.value).size === parsed.value.length
      ? parsed : failValidation(path, '値が重複しています');
  };
}

