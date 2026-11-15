import { describe, expect, it } from 'vitest';
import { evaluateFilter } from '../src/domain/filter';
import type { CardData, FilterNode, Predicate } from '../src/domain/types';

const card: CardData = {
  id: 'k1', name: '青眼の白龍', kana: 'ブルーアイズ・ホワイト・ドラゴン',
  kind: 'monster', monsterTypes: [], text: '',
};
const pred = (predicate: Predicate): FilterNode => ({ op: 'pred', pred: predicate });
const matches = (predicate: Predicate, target = card) => evaluateFilter(pred(predicate), target);

describe('カード名・テーマのかな照合', () => {
  it.each(['nameContains', 'archetype'] as const)('%s は名前・読みの両方をかなで照合する', kind => {
    expect(matches({ kind, text: 'ぶらっく' }, { ...card, name: 'ブラック・マジシャン', kana: undefined })).toBe(true);
    expect(matches({ kind, text: 'ぶるーあいず' })).toBe(true);
    expect(matches({ kind, text: 'ハルウララ' }, { ...card, name: '灰流うらら', kana: 'はるうらら' })).toBe(true);
  });

  it.each(['ぶるーあいず', 'ブルーアイズ', 'ﾌﾞﾙｰｱｲｽﾞ'])(
    'テーマ %s はテキストのテーマ扱いだけでも一致する', text => {
      const textOnly = { ...card, name: '別名', kana: undefined };
      expect(matches({ kind: 'archetype', text }, {
        ...textOnly, text: 'このカードはルール上「真ブルーアイズ系列」カードとしても扱う。',
      })).toBe(true);
      expect(matches({ kind: 'archetype', text }, {
        ...textOnly, text: '「ぶるーあいず」かーどとしても扱う。',
      })).toBe(true);
      expect(matches({ kind: 'archetype', text }, {
        ...textOnly, text: '「ブルーアイズ」モンスターとして扱う。',
      })).toBe(false);
    },
  );

  it('かなをそろえた後も正規表現の特殊文字を文字どおり照合する', () => {
    const textOnly = { ...card, name: '別名', kana: undefined, text: '「[ブルー]+(?)」カードとしても扱う。' };
    expect(matches({ kind: 'archetype', text: '[ぶるー]+(?)' }, textOnly)).toBe(true);
    expect(matches({ kind: 'archetype', text: '[ぶるー]+' }, { ...textOnly, text: '「ぶ」カードとしても扱う。' })).toBe(false);
  });

  it.each(['nameContains', 'archetype'] as const)('%s では区切りを取り除かない', kind => {
    const hero = { ...card, name: 'Ｅ・ＨＥＲＯ テスト', kana: undefined };
    expect(matches({ kind, text: 'Ｅ－ＨＥＲＯ' }, hero)).toBe(false);
    expect(matches({ kind, text: 'Ｅ・ＨＥＲＯ' }, hero)).toBe(true);
    expect(matches({ kind, text: 'ぶるーあいずほわいと' })).toBe(false);
    expect(matches({ kind, text: 'ぶるーあいず・ほわいと' })).toBe(true);
    expect(matches({ kind, text: '・' }, hero)).toBe(true);
  });

  it.each(['nameContains', 'archetype'] as const)('%s の空キーワード・不一致の記号は偽、否定は真', kind => {
    const plain = { ...card, name: '無関係', kana: undefined };
    for (const text of ['', '　 \t\n', '・', '-', '=', '()+?']) {
      const node = pred({ kind, text });
      expect(evaluateFilter(node, plain)).toBe(false);
      expect(evaluateFilter({ op: 'not', child: node }, plain)).toBe(true);
    }
  });

  it('カード名の否定条件で、読みに一致するカードは外れる', () => {
    const node: FilterNode = { op: 'not', child: pred({ kind: 'nameContains', text: 'ぶるーあいず' }) };
    expect(evaluateFilter(node, card)).toBe(false);
    expect(evaluateFilter(node, { ...card, kana: undefined })).toBe(true);
  });

  it('同じカードのキャッシュを使ってもテキスト・記されたカード名のかなや区切りは区別する', () => {
    const target = {
      ...card, text: '「ブラック・マジシャン」１体を選ぶ。',
      pendulumText: '「ブルーアイズ」１体を選ぶ。',
    };
    expect(matches({ kind: 'nameContains', text: 'ぶるーあいず' }, target)).toBe(true);
    for (const text of ['ぶらっく・まじしゃん', 'ブラックマジシャン']) {
      expect(matches({ kind: 'textContains', text, includePendulum: true }, target)).toBe(false);
      expect(matches({ kind: 'mentionsName', text }, target)).toBe(false);
    }
    expect(matches({ kind: 'textContains', text: 'ブラック・マジシャン', includePendulum: false }, target)).toBe(true);
    expect(matches({ kind: 'mentionsName', text: 'ブラック・マジシャン' }, target)).toBe(true);
    expect(matches({ kind: 'textContains', text: 'ブルーアイズ', includePendulum: false }, target)).toBe(false);
    expect(matches({ kind: 'textContains', text: 'ブルーアイズ', includePendulum: true }, target)).toBe(true);
    expect(matches({ kind: 'mentionsName', text: 'ぶるーあいず' }, target)).toBe(false);
    expect(matches({ kind: 'mentionsName', text: 'ブルーアイズ' }, target)).toBe(true);
  });
});
