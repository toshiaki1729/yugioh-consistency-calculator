import { describe, expect, it } from 'vitest';
import { evaluateFilter, isInGroup } from '../src/domain/filter';
import type { CardData, FilterNode, Predicate } from '../src/domain/types';
import cards from './fixtures/ruleNameCards.json';

const [whiteDragon, redRice, harpie] = cards as CardData[];
const pred = (predicate: Predicate): FilterNode => ({ op: 'pred', pred: predicate });
const matches = (predicate: Predicate, card = whiteDragon) => evaluateFilter(pred(predicate), card);
const declaration = 'このカード名はルール上「アルバスの落胤」として扱う。';

describe('ルール上の名前を使う条件', () => {
  it.each([
    ['nameContains', 'アルバスの落胤'], ['nameContains', 'あるばす'],
    ['archetype', 'アルバス'], ['archetype', 'あるばす'],
  ] as const)('白き竜の落胤の %s「%s」が一致する', (kind, text) => {
    expect(matches({ kind, text })).toBe(true);
  });

  it.each(['nameContains', 'archetype'] as const)('%s はハーピィの名前とペンデュラム欄の宣言にも一致する', kind => {
    expect(matches({ kind, text: 'ハーピィ・レディ' }, harpie)).toBe(true);
    expect(matches({ kind, text: 'あるばす' }, { ...whiteDragon, text: '', pendulumText: declaration })).toBe(true);
    expect(matches({ kind, text: '白き竜' })).toBe(true);
    expect(matches({ kind, text: 'しろきりゅう' })).toBe(true);
    expect(matches({ kind, text: '　 ' })).toBe(false);
  });

  it.each([whiteDragon, redRice])('$name は宣言以外の効果にある名前の記述を数える', card => {
    const text = card === whiteDragon ? 'アルバスの落胤' : 'しゃりの軍貫';
    expect(matches({ kind: 'mentionsName', text }, card)).toBe(true);
  });

  it('宣言だけなら記されたカードに含めず、通常のテキスト検索には含める', () => {
    const card = { ...whiteDragon, text: declaration };
    expect(matches({ kind: 'mentionsName', text: 'アルバスの落胤' }, card)).toBe(false);
    expect(matches({ kind: 'textContains', text: 'アルバスの落胤', includePendulum: false }, card)).toBe(true);
    expect(matches({ kind: 'mentionsName', text: 'アルバスの落胤' }, {
      ...card, text: '', pendulumText: declaration,
    })).toBe(false);
    expect(matches({ kind: 'mentionsName', text: 'アルバスの落胤' }, {
      ...card, pendulumText: '「アルバスの落胤」１体を選ぶ。',
    })).toBe(true);
  });

  it('正規化前に改行と前置きを処理して宣言文だけを除く', () => {
    for (const prefix of ['①：', '①:', '● ⑳：']) {
      const card = { ...whiteDragon, text: `前の効果\n${prefix}${declaration}\n後の効果` };
      expect(matches({ kind: 'mentionsName', text: 'アルバスの落胤' }, card)).toBe(false);
    }
    expect(matches({ kind: 'mentionsName', text: 'アルバスの落胤' }, {
      ...whiteDragon, text: '条件により、このカード名はルール上「アルバスの落胤」として扱う。',
    })).toBe(true);
  });

  it('自己参照の除去と効果欄をまたぐ引用の防止を維持する', () => {
    const card = {
      ...whiteDragon, text: `${declaration}「白き竜の落胤」１体。「アルバス`,
      pendulumText: 'の落胤」１体。「白き竜の落胤」１体。',
    };
    expect(matches({ kind: 'mentionsName', text: 'アルバスの落胤' }, card)).toBe(false);
    expect(matches({ kind: 'mentionsName', text: '白き竜の落胤' }, card)).toBe(false);
  });

  it('宣言以外の文にある連続した句点を保持する', () => {
    const card = { ...whiteDragon, text: `${declaration}「Ａ。。Ｂ」１体。` };
    expect(matches({ kind: 'mentionsName', text: 'Ａ。。Ｂ' }, card)).toBe(true);
    expect(matches({ kind: 'mentionsName', text: 'Ａ。Ｂ' }, card)).toBe(false);
  });

  it.each([
    ['このカードのカード名は、フィールド・墓地に存在する限り「別名」として扱う。', '別名'],
    ['このカード名はルール上「伝説の竜 ティマイオス」としても扱う。', '伝説の竜 ティマイオス'],
    ['このカードのカード名は、手札以外に存在する限り「別名」として扱う。', '別名'],
  ])('対象外の宣言は名前条件に含めず、記述としては残す: %s', (text, keyword) => {
    const card = { ...whiteDragon, text };
    for (const kind of ['nameContains', 'archetype'] as const) {
      const node = pred({ kind, text: keyword });
      expect(evaluateFilter(node, card)).toBe(false);
      expect(evaluateFilter({ op: 'not', child: node }, card)).toBe(true);
    }
    expect(matches({ kind: 'mentionsName', text: keyword }, card)).toBe(true);
  });

  it('特定のカード条件はルール上の名前が同じでも指定IDだけを数える', () => {
    const original = { ...whiteDragon, id: 'k14978', name: 'アルバスの落胤', text: '' };
    expect(matches({ kind: 'cards', cardIds: [original.id] })).toBe(false);
    expect(matches({ kind: 'cards', cardIds: [original.id] }, original)).toBe(true);
    expect(matches({ kind: 'cards', cardIds: [whiteDragon.id] })).toBe(true);
  });

  it('カスタムカードと補助データにも同じ照合を使い、手動の除外を優先する', () => {
    const group = { id: 'g1', name: 'アルバス', include: [], exclude: [],
      filter: pred({ kind: 'nameContains', text: 'あるばす' }) };
    for (const card of [whiteDragon, { ...whiteDragon, id: 'c:example', custom: true }]) {
      expect(isInGroup(group, card.id, card)).toBe(true);
      expect(isInGroup({ ...group, exclude: [card.id] }, card.id, card)).toBe(false);
    }
  });
});
