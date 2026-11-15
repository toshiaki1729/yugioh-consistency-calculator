import { describe, expect, it } from 'vitest';
import { createCardDb } from '../src/carddb/loader';
import type { CardData } from '../src/domain/types';

const cards: CardData[] = [
  { id: 'k1', name: 'ブラック・マジシャン', kind: 'monster', monsterTypes: [], text: '' },
  { id: 'k2', name: '女邪神ヌヴィア', kana: 'めじゃしんヌヴィア', kind: 'monster', monsterTypes: [], text: '' },
  { id: 'k3', name: '増殖するＧ', kana: 'ぞうしょくするジー', kind: 'monster', monsterTypes: [], text: '' },
  { id: 'k4', name: '灰流うらら', kana: 'はるうらら', kind: 'monster', monsterTypes: [], text: '' },
  { id: 'k5', name: '青眼の白龍', kana: 'ブルーアイズ・ホワイト・ドラゴン', kind: 'monster', monsterTypes: [], text: '' },
  { id: 'k6', name: 'Ｅ－ＨＥＲＯ テスト', kind: 'monster', monsterTypes: [], text: '' },
  { id: 'k7', name: 'テスト＝カード', kind: 'monster', monsterTypes: [], text: '' },
];
const db = createCardDb({ version: 1, source: 'yaml-yugi', generatedAt: 'test', cards });

describe('検索用の正規化と完全一致の分離', () => {
  it.each([
    ['ぶらっくまじしゃん', 'k1'], ['めじゃしんぬゔぃあ', 'k2'],
    ['ぞうしょくするじー', 'k3'], ['はるうらら', 'k4'], ['ハルウララ', 'k4'],
    ['ぶるーあいず', 'k5'], ['ﾌﾞﾙｰｱｲｽﾞ', 'k5'], ['ＥＨＥＲＯ', 'k6'],
    ['てすとかーど', 'k7'], ['ブラック･マジシャン', 'k1'],
  ])('%s で %s が見つかる', (query, id) => {
    expect(db.search(query).map(card => card.id)).toContain(id);
  });

  it('正規化後の前方一致を部分一致より優先し、各群の名前順と上限を維持する', () => {
    const names = ['Ｘアイ', 'アイ長長長', 'アイ長', 'アイ短', 'Ｙアイ長'];
    const orderedDb = createCardDb({
      version: 1, source: 'yaml-yugi', generatedAt: 'test',
      cards: names.map((name, index) => ({ ...cards[0], id: `k${index + 10}`, name })),
    });
    const prefix = names.filter(name => name.startsWith('アイ')).sort((left, right) =>
      left.length - right.length || left.localeCompare(right, 'ja'));
    expect(orderedDb.search('あ・い').map(card => card.name))
      .toEqual([...prefix, 'Ｘアイ', 'Ｙアイ長']);
    expect(orderedDb.search('あ・い', 2).map(card => card.name)).toEqual(prefix.slice(0, 2));
  });

  it.each(['', ' \t　', '・･－-‐‑‒–—―−＝=', '.()+?'])(
    '空または一致しない記号だけの検索語 %j は候補なし', query => {
      expect(db.search(query)).toEqual([]);
    },
  );

  it('完全一致はかな・読み・区切りを同一視せず、幅・英字大小・空白だけをそろえる', () => {
    for (const query of ['ぶらっく・まじしゃん', 'ブラックマジシャン', 'ハルウララ', 'はるうらら', 'ＥＨＥＲＯ テスト']) {
      expect(db.findByExactName(query)).toEqual([]);
    }
    expect(db.findByExactName(' ﾌﾞﾗｯｸ･ﾏｼﾞｼｬﾝ ')).toEqual([cards[0]]);
    expect(db.findByExactName(' e-hero テスト ')).toEqual([cards[5]]);
    expect(db.findByExactName('灰流うらら')).toEqual([cards[3]]);
  });
});
