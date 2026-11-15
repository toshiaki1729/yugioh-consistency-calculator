import {
  failValidation, decodeObject, readFields, createShapeDecoder, createChoiceDecoder,
  allowUndefined, createArrayDecoder, decodeBoolean,
} from './decoder';
import type { Decoder } from './decoder';
import * as limits from './limits';
import type { FilterNode, NumRange, Predicate, Result } from './types';
import {
  decodeNumericValue, decodeKeyword, decodeCardKind, decodeMonsterType, decodeAttribute,
  decodeProperty, decodeRace, decodeIds,
} from './validationFields';

const decodeRangeFields = createShapeDecoder({
  min: allowUndefined(decodeNumericValue), max: allowUndefined(decodeNumericValue),
});
const decodeRange: Decoder<NumRange> = (value, path) => {
  const parsed = decodeRangeFields(value, path);
  if (!parsed.ok) return parsed;
  const { min, max } = parsed.value;
  return min !== undefined && max !== undefined && min > max
    ? failValidation(path, '最小値は最大値以下にしてください') : parsed;
};

const decodePredicate: Decoder<Predicate> = (value, path) => {
  const record = decodeObject(value, path);
  if (!record.ok) return record;
  const input = record.value;
  switch (input.kind) {
    case 'cardKind': return readFields({
      kind: createChoiceDecoder(['cardKind']), values: createArrayDecoder(decodeCardKind),
    }, input, path);
    case 'monsterType': return readFields({
      kind: createChoiceDecoder(['monsterType']), values: createArrayDecoder(decodeMonsterType),
      mode: createChoiceDecoder(['any', 'all']),
    }, input, path);
    case 'attribute': return readFields({
      kind: createChoiceDecoder(['attribute']), values: createArrayDecoder(decodeAttribute),
    }, input, path);
    case 'race': return readFields({
      kind: createChoiceDecoder(['race']), values: createArrayDecoder(decodeRace),
    }, input, path);
    case 'property': return readFields({
      kind: createChoiceDecoder(['property']), values: createArrayDecoder(decodeProperty),
    }, input, path);
    case 'cards': return readFields({
      kind: createChoiceDecoder(['cards']), cardIds: decodeIds,
    }, input, path);
    case 'level': case 'rank': case 'link': case 'atk': case 'def': case 'scale':
      return readFields({
        kind: createChoiceDecoder([input.kind]), range: decodeRange,
      }, input, path);
    case 'nameContains': case 'archetype': case 'mentionsName':
      return readFields({
        kind: createChoiceDecoder([input.kind]), text: decodeKeyword,
      }, input, path);
    case 'textContains': return readFields({
      kind: createChoiceDecoder(['textContains']),
      text: decodeKeyword, includePendulum: decodeBoolean,
    }, input, path);
    default: return failValidation(`${path}.kind`, '不明な条件の種類です');
  }
};

/** 条件式の構造・上限と各条件の値を検証する。 */
export function validateFilter(value: unknown, path = '条件式'): Result<FilterNode> {
  let nodes = 0;
  function visit(input: unknown, location: string, depth: number): Result<FilterNode> {
    if (depth > limits.MAX_FILTER_DEPTH) {
      return failValidation(location, `条件式の深さが上限（${limits.MAX_FILTER_DEPTH}）を超えています`);
    }
    if (++nodes > limits.MAX_FILTER_NODES) {
      return failValidation(location, `条件式のノード総数が上限（${limits.MAX_FILTER_NODES}）を超えています`);
    }
    const record = decodeObject(input, location);
    if (!record.ok) return record;
    const node = record.value;
    const decodeChild = (child: unknown, childPath: string) => visit(child, childPath, depth + 1);
    switch (node.op) {
      case 'and': case 'or': return readFields({
        op: createChoiceDecoder([node.op]),
        children: createArrayDecoder(decodeChild, limits.MAX_FILTER_CHILDREN),
      }, node, location);
      case 'not': return readFields({
        op: createChoiceDecoder(['not']), child: decodeChild,
      }, node, location);
      case 'pred': return readFields({
        op: createChoiceDecoder(['pred']), pred: decodePredicate,
      }, node, location);
      default: return failValidation(`${location}.op`, '不明な条件式の演算子です');
    }
  }
  return visit(value, path, 1);
}

