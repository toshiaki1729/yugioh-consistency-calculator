import {
  attributeLabels, cardKindLabels, monsterTypeLabels, spellTrapPropertyLabels,
} from './labels';
import {
  createStringDecoder, createIntegerDecoder, createEnumDecoder, createArrayDecoder,
  decodeId,
} from './decoder';
import * as limits from './limits';

/** デッキ・グループ・パターン名を読み取る。 */
export const decodeTitle = createStringDecoder(
  limits.MIN_NAME_LENGTH, limits.MAX_TITLE_LENGTH, '名前',
);
/** カード名を読み取る。 */
export const decodeCardName = createStringDecoder(
  limits.MIN_NAME_LENGTH, limits.MAX_CARD_NAME_LENGTH, 'カード名',
);
/** 条件のキーワードを読み取る。 */
export const decodeKeyword = createStringDecoder(
  limits.MIN_NAME_LENGTH, limits.MAX_KEYWORD_LENGTH, 'キーワード',
);
/** カードテキストを読み取る。 */
export const decodeCardText = createStringDecoder(
  limits.MIN_CARD_TEXT_LENGTH, limits.MAX_CARD_TEXT_LENGTH, 'カードテキスト',
);
/** カードの種類を読み取る。 */
export const decodeCardKind = createEnumDecoder(cardKindLabels);
/** モンスターの種類を読み取る。 */
export const decodeMonsterType = createEnumDecoder(monsterTypeLabels);
/** 属性を読み取る。 */
export const decodeAttribute = createEnumDecoder(attributeLabels);
/** 魔法・罠の種類を読み取る。 */
export const decodeProperty = createEnumDecoder(spellTrapPropertyLabels);
/** カード数値と範囲条件の整数を読み取る。 */
export const decodeNumericValue = createIntegerDecoder(
  limits.MIN_NUMERIC_VALUE, limits.MAX_NUMERIC_VALUE, '数値',
);
/** 手動指定するカード ID 配列を読み取る。 */
export const decodeIds = createArrayDecoder(decodeId, limits.MAX_CARD_IDS);
/** 種族名を読み取る。 */
export const decodeRace = createStringDecoder(
  limits.MIN_NAME_LENGTH, limits.MAX_RACE_LENGTH, '種族名',
);
