import {
  attributeLabels, cardKindLabels, monsterTypeLabels, spellTrapPropertyLabels,
} from './labels';
import {
  createStringDecoder, createIntegerDecoder, createEnumDecoder, createArrayDecoder,
  createUniqueArrayDecoder, failValidation,
} from './decoder';
import type { Decoder } from './decoder';
import * as limits from './limits';

/** 公式カードまたはカスタムカードの ID を読み取る。 */
export const decodeCardId: Decoder<string> = (value, path) => {
  if (typeof value === 'string') {
    const suffix = value.slice(2);
    const isCustom = value.startsWith('c:') && suffix.length > 0
      && suffix.length <= limits.MAX_CUSTOM_CARD_ID_LENGTH && !/[^A-Za-z0-9_-]/.test(suffix);
    const konamiId = Number(value.slice(1));
    const isOfficial = value === `k${konamiId}` && Number.isSafeInteger(konamiId)
      && konamiId >= limits.MIN_KONAMI_ID && konamiId <= limits.MAX_KONAMI_ID;
    if (isCustom || isOfficial) return { ok: true, value };
  }
  return failValidation(path,
    `カード ID は k と 1〜${limits.MAX_KONAMI_ID} の整数（先頭の 0 なし）、`
    + `または c: と 1〜${limits.MAX_CUSTOM_CARD_ID_LENGTH} 文字の半角英数字・_・- で指定してください`);
};

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
export const decodeIds = createArrayDecoder(decodeCardId, limits.MAX_CARD_IDS);
/** 種族名を読み取る。 */
export const decodeRace = createStringDecoder(
  limits.MIN_NAME_LENGTH, limits.MAX_RACE_LENGTH, '種族名',
);

/** カードの種類条件の値を上限・重複も含めて読み取る。 */
export const decodeCardKinds = createUniqueArrayDecoder(
  decodeCardKind, limits.MAX_CARD_KIND_VALUES,
);
/** モンスターの種類を上限・重複も含めて読み取る。 */
export const decodeMonsterTypes = createUniqueArrayDecoder(
  decodeMonsterType, limits.MAX_MONSTER_TYPE_VALUES,
);
/** 属性条件の値を上限・重複も含めて読み取る。 */
export const decodeAttributes = createUniqueArrayDecoder(
  decodeAttribute, limits.MAX_ATTRIBUTE_VALUES,
);
/** 魔法・罠の種類条件の値を上限・重複も含めて読み取る。 */
export const decodeProperties = createUniqueArrayDecoder(
  decodeProperty, limits.MAX_PROPERTY_VALUES,
);
/** 種族条件の値を上限・重複も含めて読み取る。 */
export const decodeRaces = createUniqueArrayDecoder(decodeRace, limits.MAX_RACE_VALUES);
