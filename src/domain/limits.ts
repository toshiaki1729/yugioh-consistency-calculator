import {
  attributeLabels, cardKindLabels, monsterTypeLabels, spellTrapPropertyLabels,
} from './labels';

/** 保存できるデッキ数の上限。 */
export const MAX_DECKS = 50;

/** デッキのエントリ数の上限。 */
export const MAX_ENTRIES = 200;

/** デッキのグループ数の上限。 */
export const MAX_GROUPS = 200;

/** デッキのパターン数の上限。 */
export const MAX_PATTERNS = 200;

/** デッキのカスタムカード数の上限。 */
export const MAX_CUSTOM_CARDS = 200;

/** 公式ページの補助カード数の上限。 */
export const MAX_PAGE_CARDS = 200;

/** パターンのスロット数の上限。 */
export const MAX_SLOTS = 8;

/** 手動指定するカード ID 数の上限。 */
export const MAX_CARD_IDS = 200;

/** ルートを 1 とする条件式の深さ上限。 */
export const MAX_FILTER_DEPTH = 4;

/** 条件式のノード総数の上限。 */
export const MAX_FILTER_NODES = 100;

/** AND・OR の子条件数の上限。 */
export const MAX_FILTER_CHILDREN = 50;

/** エントリの最小枚数。 */
export const MIN_ENTRY_COUNT = 1;

/** エントリの最大枚数。 */
export const MAX_ENTRY_COUNT = 60;

/** スロットの最小必要枚数。 */
export const MIN_SLOT_COUNT = 1;

/** スロットの最大必要枚数。 */
export const MAX_SLOT_COUNT = 5;

/** 数値条件とカード数値の下限。 */
export const MIN_NUMERIC_VALUE = 0;

/** 数値条件とカード数値の上限。 */
export const MAX_NUMERIC_VALUE = 99999;

/** 任意の手札枚数の下限。 */
export const MIN_HAND_SIZE = 1;

/** 任意の手札枚数の上限。 */
export const MAX_HAND_SIZE = 10;

/** メインデッキの補充先に指定できる最小枚数。 */
export const MIN_MAIN_FILL_TARGET = 40;

/** メインデッキの補充先に指定できる最大枚数。 */
export const MAX_MAIN_FILL_TARGET = 60;

/** 名前・キーワードの最小文字数。 */
export const MIN_NAME_LENGTH = 1;

/** デッキ・グループ・パターン名の最大文字数。 */
export const MAX_TITLE_LENGTH = 50;

/** カード名の最大文字数。 */
export const MAX_CARD_NAME_LENGTH = 100;

/** 貼り付けるカード一覧の1行の最大文字数。 */
export const MAX_IMPORT_LINE_LENGTH = 200;

/** 条件キーワードの最大文字数。 */
export const MAX_KEYWORD_LENGTH = 100;

/** カードの読みの最大文字数。 */
export const MAX_KANA_LENGTH = 100;

/** 種族名の最大文字数。 */
export const MAX_RACE_LENGTH = 100;

/** 種族条件に指定できる値の上限。 */
export const MAX_RACE_VALUES = 30;

/** カードの種類条件に指定できる値の上限。 */
export const MAX_CARD_KIND_VALUES = Object.keys(cardKindLabels).length;

/** モンスターの種類に指定できる値の上限。 */
export const MAX_MONSTER_TYPE_VALUES = Object.keys(monsterTypeLabels).length;

/** 属性条件に指定できる値の上限。 */
export const MAX_ATTRIBUTE_VALUES = Object.keys(attributeLabels).length;

/** 魔法・罠の種類条件に指定できる値の上限。 */
export const MAX_PROPERTY_VALUES = Object.keys(spellTrapPropertyLabels).length;

/** カスタムカード ID の c: に続く部分の最大文字数。 */
export const MAX_CUSTOM_CARD_ID_LENGTH = 64;

/** カードテキストの最小文字数。 */
export const MIN_CARD_TEXT_LENGTH = 0;

/** カードテキストの最大文字数。 */
export const MAX_CARD_TEXT_LENGTH = 5000;

/** 公式カード ID の最小値。 */
export const MIN_KONAMI_ID = 1;

/** 公式カード ID の最大値。 */
export const MAX_KONAMI_ID = Number.MAX_SAFE_INTEGER;

/** 更新時刻の最小値。 */
export const MIN_TIMESTAMP = 0;

/** 読み込める JSON ファイルの最大バイト数。 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** 保存状態の対応スキーマ版。 */
export const APP_SCHEMA_VERSION = 2;

/** パターンに指定できる追加の条件数の上限。 */
export const MAX_PATTERN_CONDITIONS = 8;
/** デッキに定義できるドロー効果数の上限。 */
export const MAX_DRAW_EFFECTS = 30;
/** 効果に必要な手順数の下限。 */
export const MIN_EFFECT_STEPS = 1;
/** 効果に指定できる手順数の上限。 */
export const MAX_EFFECT_STEPS = 6;
/** 移動先の指定数の下限。 */
export const MIN_MOVE_ZONES = 1;
/** 移動先の指定数の上限。 */
export const MAX_MOVE_ZONES = 3;
/** デッキに残る必要枚数の下限。 */
export const MIN_REMAINING_COUNT = 1;
/** デッキに残る必要枚数の上限。 */
export const MAX_REMAINING_COUNT = 60;
/** 条件・手順でデッキの上から除外する枚数の下限。 */
export const MIN_BANISH_COUNT = 1;
/** 条件・手順でデッキの上から除外する枚数の上限。 */
export const MAX_BANISH_COUNT = 20;
/** 一つの手順でドローする枚数の下限。 */
export const MIN_DRAW_COUNT = 1;
/** 一つの手順でドローする枚数の上限。 */
export const MAX_DRAW_COUNT = 5;
/** 一つの手順でめくる枚数の下限。 */
export const MIN_EXCAVATE_COUNT = 1;
/** 一つの手順でめくる枚数の上限。 */
export const MAX_EXCAVATE_COUNT = 10;

