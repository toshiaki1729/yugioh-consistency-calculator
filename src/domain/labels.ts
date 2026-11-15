import type { Attribute, CardKind, MonsterType, SpellTrapProperty } from './types';

/** カードの種類の日本語表示名。 */
export const cardKindLabels: Record<CardKind, string> = {
  monster: 'モンスター', spell: '魔法', trap: '罠',
};
/** モンスターの種類の日本語表示名。 */
export const monsterTypeLabels: Record<MonsterType, string> = {
  normal: '通常', effect: '効果', fusion: '融合', ritual: '儀式', synchro: 'シンクロ',
  xyz: 'エクシーズ', pendulum: 'ペンデュラム', link: 'リンク', tuner: 'チューナー',
  flip: 'リバース', toon: 'トゥーン', spirit: 'スピリット', union: 'ユニオン',
  gemini: 'デュアル', special: '特殊召喚',
};
/** 属性の日本語表示名。 */
export const attributeLabels: Record<Attribute, string> = {
  dark: '闇', light: '光', earth: '地', water: '水', fire: '炎', wind: '風', divine: '神',
};
/** 魔法・罠の種類の日本語表示名。 */
export const spellTrapPropertyLabels: Record<SpellTrapProperty, string> = {
  normal: '通常', quickplay: '速攻', continuous: '永続', equip: '装備', field: 'フィールド',
  ritual: '儀式', counter: 'カウンター',
};
/** 条件指定に使う種族名の一覧。 */
export const races = [
  '魔法使い族', 'ドラゴン族', 'アンデット族', '戦士族', '獣戦士族', '獣族', '鳥獣族',
  '悪魔族', '天使族', '昆虫族', '恐竜族', '爬虫類族', '魚族', '海竜族', '水族', '炎族',
  '雷族', '岩石族', '植物族', '機械族', 'サイキック族', '幻神獣族', '幻竜族',
  'サイバース族', '幻想魔族', '創造神族',
] as const;
