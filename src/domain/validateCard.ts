import {
  createShapeDecoder, createStringDecoder, createIntegerDecoder, allowUndefined, allowNull,
  createArrayDecoder, decodeId, decodeBoolean,
} from './decoder';
import type { Decoder } from './decoder';
import * as limits from './limits';
import type { CardData, Result } from './types';
import {
  decodeCardName, decodeCardText, decodeCardKind, decodeMonsterType, decodeAttribute,
  decodeProperty, decodeRace, decodeNumericValue,
} from './validationFields';

const decodeKonamiId = createIntegerDecoder(
  limits.MIN_KONAMI_ID, limits.MAX_KONAMI_ID, '公式カード ID',
);
const decodeKana = createStringDecoder(limits.MIN_NAME_LENGTH, limits.MAX_KANA_LENGTH, '読み');
const decodeOptionalNumber = allowUndefined(decodeNumericValue);
const decodeCombatStat = allowUndefined(allowNull(decodeNumericValue));
const decodeCardData: Decoder<CardData> = createShapeDecoder({
  id: decodeId, konamiId: allowUndefined(decodeKonamiId),
  name: decodeCardName, kana: allowUndefined(decodeKana), kind: decodeCardKind,
  monsterTypes: createArrayDecoder(decodeMonsterType),
  attribute: allowUndefined(decodeAttribute), race: allowUndefined(decodeRace),
  level: decodeOptionalNumber, rank: decodeOptionalNumber, link: decodeOptionalNumber,
  atk: decodeCombatStat, def: decodeCombatStat, scale: decodeOptionalNumber,
  property: allowUndefined(decodeProperty), text: decodeCardText,
  pendulumText: allowUndefined(decodeCardText), custom: allowUndefined(decodeBoolean),
});

/** カードの各項目を検証する。 */
export function validateCardData(value: unknown, path = 'カード'): Result<CardData> {
  return decodeCardData(value, path);
}

