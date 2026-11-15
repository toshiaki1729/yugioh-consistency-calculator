import { describe, expect, it } from 'vitest';
import { evaluateFilter, isInGroup } from '../src/domain/filter';
import { attributeLabels, cardKindLabels, monsterTypeLabels, races, spellTrapPropertyLabels } from '../src/domain/labels';
import { escapeRegExp, normalizeForMatch } from '../src/domain/normalize';
import type { CardData, CardGroup, FilterNode, Predicate } from '../src/domain/types';

const blueEyes: CardData = {
  id: 'k4007', name: '青眼の白龍', kana: 'ブルーアイズ・ホワイト・ドラゴン',
  kind: 'monster', monsterTypes: ['normal'], attribute: 'light', race: 'ドラゴン族',
  level: 8, atk: 3000, def: 2500, text: '高い攻撃力を誇る伝説のドラゴン。',
};
const alternative: CardData = {
  ...blueEyes, id: 'k12253', name: '青眼の亜白龍', monsterTypes: ['effect'],
  text: 'このカードは通常召喚できない。手札の「青眼の白龍」１体を相手に見せた場合に特殊召喚できる。'
    + '「青眼の亜白龍」は１ターンに１度しか特殊召喚できない。'
    + 'このカードのカード名は、フィールド・墓地に存在する限り「青眼の白龍」として扱う。',
};
const pred = (value: Predicate): FilterNode => ({ op: 'pred', pred: value });
const matches = (value: Predicate, card = blueEyes) => evaluateFilter(pred(value), card);

describe('表示名と正規化', () => {
  it('すべての列挙値に表示名があり、種族は指定された26種の順', () => {
    expect(Object.keys(cardKindLabels)).toEqual(['monster', 'spell', 'trap']);
    expect(Object.keys(monsterTypeLabels)).toHaveLength(15);
    expect(Object.keys(attributeLabels)).toHaveLength(7);
    expect(Object.keys(spellTrapPropertyLabels)).toHaveLength(7);
    expect(monsterTypeLabels).toMatchObject({ pendulum: 'ペンデュラム', special: '特殊召喚', gemini: 'デュアル', flip: 'リバース' });
    expect(spellTrapPropertyLabels.quickplay).toBe('速攻');
    expect(races).toEqual([
      '魔法使い族', 'ドラゴン族', 'アンデット族', '戦士族', '獣戦士族', '獣族', '鳥獣族',
      '悪魔族', '天使族', '昆虫族', '恐竜族', '爬虫類族', '魚族', '海竜族', '水族', '炎族',
      '雷族', '岩石族', '植物族', '機械族', 'サイキック族', '幻神獣族', '幻竜族', 'サイバース族', '幻想魔族', '創造神族',
    ]);
  });
  it('NFKC・英字小文字化・空白除去を両側に適用できる', () => {
    expect(normalizeForMatch('　Ｎｏ．３９ \t Ｌ召喚\n１５００')).toBe('no.39l召喚1500');
    expect(normalizeForMatch('ﾌﾞﾙｰｱｲｽﾞ')).toBe('ブルーアイズ');
    expect(matches({ kind: 'nameContains', text: ' Ｌ 召喚 ' }, { ...blueEyes, name: 'L召喚のカード' })).toBe(true);
    expect(matches({ kind: 'textContains', text: '１５００', includePendulum: false }, { ...blueEyes, text: '攻撃力1500以下' })).toBe(true);
    expect(matches({ kind: 'textContains', text: 'L召喚', includePendulum: false }, { ...blueEyes, text: 'Ｌ召喚' })).toBe(true);
  });
  it('正規表現の特殊文字をリテラルにする', () => {
    const literal = '.*+?^${}()|[]\\';
    expect(new RegExp(`^${escapeRegExp(literal)}$`).test(literal)).toBe(true);
  });
});

describe('条件式', () => {
  it('列挙条件はOR、モンスター種類はany/all', () => {
    expect(matches({ kind: 'cardKind', values: ['spell', 'monster'] })).toBe(true);
    expect(matches({ kind: 'cardKind', values: ['spell', 'trap'] })).toBe(false);
    expect(matches({ kind: 'attribute', values: ['dark', 'light'] })).toBe(true);
    expect(matches({ kind: 'attribute', values: ['dark'] })).toBe(false);
    expect(matches({ kind: 'race', values: ['魔法使い族', 'ドラゴン族'] })).toBe(true);
    expect(matches({ kind: 'race', values: ['魔法使い族'] })).toBe(false);
    const tuner = { ...blueEyes, monsterTypes: ['normal', 'tuner'] as CardData['monsterTypes'] };
    expect(matches({ kind: 'monsterType', mode: 'any', values: ['effect', 'tuner'] }, tuner)).toBe(true);
    expect(matches({ kind: 'monsterType', mode: 'all', values: ['normal', 'tuner'] }, tuner)).toBe(true);
    expect(matches({ kind: 'monsterType', mode: 'all', values: ['effect', 'tuner'] }, tuner)).toBe(false);
    expect(matches({ kind: 'monsterType', mode: 'any', values: ['effect'] }, tuner)).toBe(false);
    const spell: CardData = { id: 'k1', name: '魔法', kind: 'spell', monsterTypes: [], property: 'quickplay', text: '' };
    expect(matches({ kind: 'property', values: ['normal', 'quickplay'] }, spell)).toBe(true);
    expect(matches({ kind: 'property', values: ['counter'] }, spell)).toBe(false);
    expect(matches({ kind: 'property', values: ['normal'] })).toBe(false);
    expect(matches({ kind: 'attribute', values: ['light'] }, spell)).toBe(false);
    expect(matches({ kind: 'race', values: ['ドラゴン族'] }, spell)).toBe(false);
    expect(matches({ kind: 'cards', cardIds: ['k1', blueEyes.id] })).toBe(true);
    expect(matches({ kind: 'cards', cardIds: ['k1'] })).toBe(false);
  });

  it.each(['level', 'rank', 'link', 'atk', 'def', 'scale'] as const)('%s は両端を含み、片側・空範囲も使える', kind => {
    const card = { ...blueEyes, [kind]: 4 };
    expect(matches({ kind, range: { min: 4, max: 4 } }, card)).toBe(true);
    expect(matches({ kind, range: { min: 5 } }, card)).toBe(false);
    expect(matches({ kind, range: { max: 3 } }, card)).toBe(false);
    expect(matches({ kind, range: { min: 4 } }, card)).toBe(true);
    expect(matches({ kind, range: { max: 4 } }, card)).toBe(true);
    expect(matches({ kind, range: {} }, card)).toBe(true);
    expect(matches({ kind, range: {} }, { ...card, [kind]: undefined })).toBe(false);
  });
  it('レベルのないXyz、?の攻守、リンクの守備力、魔法の攻撃力は一致しない', () => {
    expect(matches({ kind: 'level', range: { max: 4 } }, { ...blueEyes, monsterTypes: ['xyz'], level: undefined, rank: 4 })).toBe(false);
    expect(matches({ kind: 'atk', range: { min: 0 } }, { ...blueEyes, atk: null })).toBe(false);
    expect(matches({ kind: 'def', range: {} }, { ...blueEyes, def: null })).toBe(false);
    expect(matches({ kind: 'def', range: {} }, { ...blueEyes, monsterTypes: ['link'], def: undefined })).toBe(false);
    expect(matches({ kind: 'atk', range: {} }, { id: 'k2', name: '魔法', kind: 'spell', monsterTypes: [], text: '' })).toBe(false);
  });

  it('テーマは名前・読み・テーマ扱いの記述で一致する', () => {
    expect(matches({ kind: 'archetype', text: '青眼' })).toBe(true);
    expect(matches({ kind: 'archetype', text: 'ブルーアイズ' })).toBe(true);
    expect(matches({ kind: 'nameContains', text: 'ブルーアイズ' })).toBe(true);
    expect(matches({ kind: 'archetype', text: 'Ｘ' }, { ...blueEyes, text: 'このカードはルール上「EXシリーズ」カードとしても扱う。' })).toBe(true);
    expect(matches({ kind: 'archetype', text: 'Ｘ' }, { ...blueEyes, text: '「EXシリーズ」モンスターとして扱う。' })).toBe(false);
  });
  it('テーマ中の正規表現の特殊文字を名前・テキストとも文字どおり扱う', () => {
    expect(matches({ kind: 'archetype', text: 'Ｎｏ．' }, { ...blueEyes, name: 'Ｎｏ．３９ 希望皇ホープ' })).toBe(true);
    expect(matches({ kind: 'archetype', text: 'Ｎｏ．' }, { ...blueEyes, name: 'No1' })).toBe(false);
    expect(matches({ kind: 'archetype', text: 'Ｎｏ．' }, { ...blueEyes, text: '「No1」カードとしても扱う' })).toBe(false);
    expect(matches({ kind: 'archetype', text: 'Ｎｏ．' }, { ...blueEyes, text: '「No.1」カードとしても扱う' })).toBe(true);
    expect(matches({ kind: 'archetype', text: '[X]+' }, { ...blueEyes, text: '「[X]+」カードとしても扱う' })).toBe(true);
  });

  it('記されたカード名は自己参照をすべて除く', () => {
    expect(matches({ kind: 'mentionsName', text: '青眼の白龍' }, alternative)).toBe(true);
    expect(matches({ kind: 'mentionsName', text: '青眼の亜白龍' }, alternative)).toBe(false);
    expect(matches({ kind: 'mentionsName', text: '青眼の白龍' }, {
      ...blueEyes, text: '「青眼の白龍」１体。「青眼の白龍」２体。', pendulumText: '「青眼の白龍」３体。',
    })).toBe(false);
  });
  it.each(['モンスター', 'カード', '魔法', '罠'])('引用直後が%sならテーマ指定として除く', suffix => {
    const card = { ...blueEyes, text: `「ブラック・マジシャン」 ${suffix}１体を…` };
    expect(matches({ kind: 'mentionsName', text: 'ブラック・マジシャン' }, card)).toBe(false);
    expect(matches({ kind: 'mentionsName', text: 'ブラック・マジシャン' }, { ...card, text: card.text + '「ブラック・マジシャン」１体を…' })).toBe(true);
  });
  it('名前の引用は完全一致で、読みや単なるテキストでは一致しない', () => {
    expect(matches({ kind: 'mentionsName', text: '青眼' }, alternative)).toBe(false);
    expect(matches({ kind: 'mentionsName', text: '青眼の白龍' }, { ...alternative, text: '青眼の白龍１体' })).toBe(false);
    expect(matches({ kind: 'mentionsName', text: 'Ｎｏ．' }, { ...blueEyes, text: '「No1」１体' })).toBe(false);
  });
  it('ペンデュラム効果はtextContainsの指定に従い、mentionsNameでは常に調べる', () => {
    const card = { ...blueEyes, pendulumText: '「ブラック・マジシャン」１体を特殊召喚する。' };
    expect(matches({ kind: 'textContains', text: '特殊召喚', includePendulum: false }, card)).toBe(false);
    expect(matches({ kind: 'textContains', text: '特殊召喚', includePendulum: true }, card)).toBe(true);
    expect(matches({ kind: 'mentionsName', text: 'ブラック・マジシャン' }, card)).toBe(true);
    expect(matches({ kind: 'textContains', text: 'ドラゴン', includePendulum: false }, card)).toBe(true);
  });
  it('空のANDは真、空のORは偽、NOTと入れ子を評価する', () => {
    expect(evaluateFilter({ op: 'and', children: [] }, blueEyes)).toBe(true);
    expect(evaluateFilter({ op: 'or', children: [] }, blueEyes)).toBe(false);
    const dark = pred({ kind: 'attribute', values: ['dark'] });
    expect(evaluateFilter({ op: 'not', child: dark }, blueEyes)).toBe(true);
    expect(evaluateFilter({ op: 'and', children: [dark, { op: 'not', child: dark }] }, blueEyes)).toBe(false);
    expect(evaluateFilter({ op: 'or', children: [dark, { op: 'not', child: dark }] }, blueEyes)).toBe(true);
  });
});

describe('グループの所属', () => {
  const group: CardGroup = {
    id: 'g1', name: '闇以外', include: [], exclude: [],
    filter: { op: 'not', child: pred({ kind: 'attribute', values: ['dark'] }) },
  };
  it('excludeがincludeと条件より優先する', () => {
    expect(isInGroup({ ...group, include: [blueEyes.id], exclude: [blueEyes.id] }, blueEyes.id, blueEyes)).toBe(false);
    expect(isInGroup({ ...group, exclude: [blueEyes.id] }, blueEyes.id, blueEyes)).toBe(false);
    expect(isInGroup({ ...group, include: [blueEyes.id] }, blueEyes.id, { ...blueEyes, attribute: 'dark' })).toBe(true);
    expect(isInGroup(group, blueEyes.id, blueEyes)).toBe(true);
    expect(isInGroup(group, blueEyes.id, { ...blueEyes, attribute: 'dark' })).toBe(false);
  });
  it('未取得カードはNOTや空のANDでも一致せず、includeでのみ追加できる', () => {
    expect(isInGroup(group, blueEyes.id, undefined)).toBe(false);
    expect(isInGroup({ ...group, filter: { op: 'and', children: [] } }, blueEyes.id, undefined)).toBe(false);
    expect(isInGroup({ ...group, include: [blueEyes.id] }, blueEyes.id, undefined)).toBe(true);
    expect(isInGroup({ ...group, include: [blueEyes.id], exclude: [blueEyes.id] }, blueEyes.id, undefined)).toBe(false);
  });
});
