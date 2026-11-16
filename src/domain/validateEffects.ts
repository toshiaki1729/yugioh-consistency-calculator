import {
  allowNull, allowUndefined, createArrayDecoder, createChoiceDecoder, createIntegerDecoder,
  createShapeDecoder,
  createUniqueArrayDecoder, decodeBoolean, decodeId, decodeObject, failValidation, readFields,
} from './decoder';
import type { Decoder } from './decoder';
import * as limits from './limits';
import type { DrawEffect, EffectStep, PatternCondition } from './types';
import { decodeCardId, decodeSource } from './validationFields';

const decodeRemaining = createIntegerDecoder(
  limits.MIN_REMAINING_COUNT, limits.MAX_REMAINING_COUNT, '残す枚数',
);
const decodeBanish = createIntegerDecoder(
  limits.MIN_BANISH_COUNT, limits.MAX_BANISH_COUNT, '除外する枚数',
);

function requireMinimumItems<T>(decode: Decoder<T[]>, min: number): Decoder<T[]> {
  return (value, path) => {
    const parsed = decode(value, path);
    if (!parsed.ok) return parsed;
    return parsed.value.length >= min
      ? parsed : failValidation(path, `${min} 件以上指定してください`);
  };
}

function defaultEmptyArray<T>(decode: Decoder<T[]>): Decoder<T[]> {
  return (value, path) => decode(value === undefined ? [] : value, path);
}

const decodeZones = requireMinimumItems(createUniqueArrayDecoder(
  createChoiceDecoder(['graveyard', 'banishedFaceUp', 'banishedFaceDown']), limits.MAX_MOVE_ZONES,
), limits.MIN_MOVE_ZONES);

const decodeCondition: Decoder<PatternCondition> = (value, path) => {
  const record = decodeObject(value, path);
  if (!record.ok) return record;
  switch (record.value.kind) {
    case 'deckAtLeast': return readFields({
      kind: createChoiceDecoder(['deckAtLeast']), target: decodeSource, count: decodeRemaining,
    }, record.value, path);
    case 'movedExcludes':
    case 'movedIncludes': return readFields({
      kind: createChoiceDecoder(['movedExcludes', 'movedIncludes']),
      target: decodeSource, zones: decodeZones,
    }, record.value, path);
    case 'deckAfterBanish': return readFields({
      kind: createChoiceDecoder(['deckAfterBanish']), target: decodeSource,
      banish: decodeBanish, count: decodeRemaining,
    }, record.value, path);
    default: return failValidation(`${path}.kind`, '追加の条件の種類が不正です');
  }
};

const decodeStep: Decoder<EffectStep> = (value, path) => {
  const record = decodeObject(value, path);
  if (!record.ok) return record;
  switch (record.value.kind) {
    case 'draw': return readFields({
      kind: createChoiceDecoder(['draw']),
      count: createIntegerDecoder(limits.MIN_DRAW_COUNT, limits.MAX_DRAW_COUNT, 'ドローする枚数'),
    }, record.value, path);
    case 'banishTop': return readFields({
      kind: createChoiceDecoder(['banishTop']), count: decodeBanish,
    }, record.value, path);
    case 'excavate': return readFields({
      kind: createChoiceDecoder(['excavate']), target: allowNull(decodeSource),
      count: createIntegerDecoder(
        limits.MIN_EXCAVATE_COUNT, limits.MAX_EXCAVATE_COUNT, 'めくる枚数',
      ),
    }, record.value, path);
    case 'search': return readFields({
      kind: createChoiceDecoder(['search']), target: decodeSource,
    }, record.value, path);
    case 'handCost': return readFields({
      kind: createChoiceDecoder(['handCost']), target: decodeSource,
      destination: createChoiceDecoder(['graveyard', 'banishedFaceUp']),
      whenMissing: allowUndefined(createChoiceDecoder(['graveyard', 'banishedFaceUp'])),
    }, record.value, path);
    default: return failValidation(`${path}.kind`, 'ドロー効果の手順の種類が不正です');
  }
};

const decodeEffect: Decoder<DrawEffect> = createShapeDecoder({
  id: decodeId, cardId: decodeCardId, oncePerTurn: decodeBoolean, firstOnly: decodeBoolean,
  drawLock: createChoiceDecoder(['none', 'after', 'turn']),
  steps: requireMinimumItems(
    createArrayDecoder(decodeStep, limits.MAX_EFFECT_STEPS), limits.MIN_EFFECT_STEPS,
  ),
});

/** 追加の条件を検証し、省略された場合だけ空の配列を補う。 */
export const decodeConditions = defaultEmptyArray(
  createArrayDecoder(decodeCondition, limits.MAX_PATTERN_CONDITIONS),
);
/** ドロー効果を検証し、省略された場合だけ空の配列を補う。 */
export const decodeEffects = defaultEmptyArray(
  createArrayDecoder(decodeEffect, limits.MAX_DRAW_EFFECTS),
);
