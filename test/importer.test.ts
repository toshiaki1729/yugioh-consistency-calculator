import { describe, expect, it, vi } from 'vitest';
import { convertCards } from '../src/carddb/convert';
import { createCardDb } from '../src/carddb/loader';
import { attributeLabels, monsterTypeLabels } from '../src/domain/labels';
import { validateCardData } from '../src/domain/validate';
import { decodePayload, encodePayload, validatePayload } from '../src/importer/payload';
import type { ImportPayload } from '../src/importer/payload';
import { parseDeckText } from '../src/importer/text';
import { buildCardFromDetail } from '../src/importer/pageData';
import { resolveImport } from '../src/importer/resolve';
import sample from './fixtures/yaml-yugi-sample.json';

const db = createCardDb(convertCards(sample, '2026-11-15T00:00:00.000Z').db);
const isKnownName = (name: string) => db.findByExactName(name).length > 0;
const card = { name: '灰流うらら', count: 3, section: 'main' as const };
const payload: ImportPayload = { v: 1, source: 'text', deckName: '日本語デッキ🐉', cards: [card] };

describe('取り込みデータの境界検証', () => {
  it('UTF-8の日本語・絵文字をbase64urlで往復する', () => {
    const encoded = encodePayload(payload);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePayload(encoded)).toEqual({ ok: true, value: payload });
  });

  it.each([
    null, [], {}, { ...payload, v: 2 }, { ...payload, source: 'other' },
    { ...payload, deckName: '' }, { ...payload, deckName: 'a'.repeat(51) },
    { ...payload, cards: [] }, { ...payload, cards: Array(201).fill(card) },
    ...[null, [], {}, { ...card, name: '' }, { ...card, name: 'a'.repeat(101) },
      { ...card, name: 1 }, { ...card, section: 'unknown' },
      ...[0, 61, 1.5, '3', NaN, Infinity].map(count => ({ ...card, count })),
      ...[0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1].map(cid => ({ ...card, cid })),
      ...[null, [], 'text', { attr: 1 }, { text: 'a'.repeat(2001) }].map(detail => ({ ...card, detail })),
    ].map(item => ({ ...payload, cards: [item] })),
  ])('不正な入力を全体拒否する: %j', input => {
    expect(validatePayload(input).ok).toBe(false);
  });

  it('上限値を受け入れ、未知のフィールドを内部へ渡さない', () => {
    const input = { ...payload, deckName: 'a'.repeat(50), ignored: true, cards: Array(200).fill({
      ...card, name: 'a'.repeat(100), count: 60, cid: Number.MAX_SAFE_INTEGER,
      detail: Object.fromEntries(['attr', 'levelRank', 'species', 'atk', 'def', 'text'].map(key => [key, 'a'.repeat(2000)])),
    }) };
    const result = validatePayload(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).not.toHaveProperty('ignored');
    for (const key of ['attr', 'levelRank', 'species', 'atk', 'def', 'text']) {
      expect(validatePayload({ ...payload, cards: [{ ...card, detail: { [key]: 'a'.repeat(2001) } }] }).ok).toBe(false);
    }
  });

  it.each(['', 'a', 'abc=', 'a+b/', 'a b', '日本語', 'Zh', '_w', 'e30', 'a'.repeat(200001)])(
    '不正なbase64url・UTF-8・JSON・巨大入力を拒否する', encoded => {
      expect(decodePayload(encoded).ok).toBe(false);
    },
  );

  it('デコード時にもpayloadのスキーマを検証する', () => {
    expect(decodePayload(encodePayload({ ...payload, cards: [] })).ok).toBe(false);
  });
});

describe('貼り付けテキスト', () => {
  it.each([
    ['3 灰流うらら', '灰流うらら', 3], ['灰流うらら x3', '灰流うらら', 3],
    ['灰流うらら×3', '灰流うらら', 3], ['灰流うらら * 3', '灰流うらら', 3],
    ['未知のカード\t2', '未知のカード', 2], ['灰流うらら 2', '灰流うらら', 2],
    ['未知のカード 2', '未知のカード 2', 1], ['Ｎｏ．３９ 希望皇ホープ', 'Ｎｏ．３９ 希望皇ホープ', 1],
    ['エクストラ・ヴェーラー', 'エクストラ・ヴェーラー', 1], ['３ 灰流うらら', '灰流うらら', 3],
  ])('%sをカード行として解析する', (text, name, count) => {
    expect(parseDeckText(text, isKnownName)).toEqual({ payload: {
      v: 1, source: 'text', cards: [{ name, count, section: 'main' }],
    }, errors: [] });
  });

  it('DB完全一致、先頭枚数、末尾枚数の順に優先する', () => {
    expect(parseDeckText('3 カード x2', () => true).payload?.cards[0]).toMatchObject({ name: '3 カード x2', count: 1 });
    expect(parseDeckText('3 カード x2', () => false).payload?.cards[0]).toMatchObject({ name: 'カード x2', count: 3 });
    expect(parseDeckText('no.39 希望皇ホープ', isKnownName).payload?.cards[0].count).toBe(1);
  });

  it.each([
    ['メイン', 'main'], ['メインデッキ', 'main'], ['MAIN', 'main'],
    ['エクストラ', 'extra'], ['エクストラデッキ', 'extra'], ['ex', 'extra'], ['ＥＸデッキ', 'extra'], ['extra', 'extra'],
    ['サイド', 'side'], ['サイドデッキ', 'side'], ['SIDE', 'side'],
  ])('装飾付きの見出し%sを完全一致で扱う', (heading, section) => {
    expect(parseDeckText(`■【${heading}】：\n灰流うらら`, isKnownName).payload?.cards[0].section).toBe(section);
  });

  it('空行・コメントを無視し、区分を切り替える', () => {
    const result = parseDeckText('\n # コメント\r\n灰流うらら\n【エクストラ】\nＮｏ．３９ 希望皇ホープ\n[サイド]\n2 灰流うらら\n<メイン>\nエクストラ・ヴェーラー', isKnownName);
    expect(result.errors).toEqual([]);
    expect(result.payload?.cards.map(item => item.section)).toEqual(['main', 'extra', 'side', 'main']);
  });

  it('解析できない行は行番号付きで返し、部分的に読み込まない', () => {
    const result = parseDeckText('# コメント\n灰流うらら\n61 灰流うらら\nカード×0\nx3\n' + 'a'.repeat(101), isKnownName);
    expect(result.payload).toBeNull();
    expect(result.errors.map(error => error.line)).toEqual([3, 4, 5, 6]);
    expect(parseDeckText(Array(201).fill('灰流うらら').join('\n'), isKnownName).errors[0].line).toBe(201);
    expect(parseDeckText('a'.repeat(200001), isKnownName).payload).toBeNull();
    expect(parseDeckText('\n# コメント\n【メイン】', isKnownName).payload).toBeNull();
  });

  it('JSON形式にも共通検証を適用する', () => {
    expect(parseDeckText(' \n' + JSON.stringify(payload), isKnownName)).toEqual({ payload, errors: [] });
    expect(parseDeckText('{', isKnownName).payload).toBeNull();
    expect(parseDeckText(JSON.stringify({ ...payload, cards: [{ ...card, count: 61 }] }), isKnownName).payload).toBeNull();
  });
});

describe('公式ページの詳細データ', () => {
  it('日本語ラベルから属性と全モンスター種別を引く', () => {
    for (const [attribute, label] of Object.entries(attributeLabels)) {
      expect(buildCardFromDetail(1, 'カード', { attr: `${label}属性` })?.attribute).toBe(attribute);
    }
    for (const [type, label] of Object.entries(monsterTypeLabels)) {
      expect(buildCardFromDetail(1, 'カード', { species: `【 ドラゴン族 ／ ${label} 】` }))
        .toMatchObject({ kind: 'monster', race: 'ドラゴン族', monsterTypes: [type] });
    }
  });

  it.each([['レベル ２', 'level', 2], ['ランク ４', 'rank', 4], ['リンク ２', 'link', 2]])(
    '%sを数値にする', (levelRank, key, value) => {
      const result = buildCardFromDetail(1, 'カード', { levelRank, atk: '攻撃力 １００００', def: '守備力 ？' });
      expect(result).toMatchObject({ [key]: value, atk: 10000 });
      expect(validateCardData(result).ok).toBe(true);
      if (key === 'link') expect(result).not.toHaveProperty('def');
      else expect(result?.def).toBeNull();
    },
  );

  it('不明な数値を省略し、判別できたフィールドを残す', () => {
    const result = buildCardFromDetail(2, '未収録カード', {
      attr: '水属性', levelRank: 'レベル 不明', species: '【 魚族 ／ 未知 】', atk: '攻撃力 ?', def: '守備力 12abc', text: '効果\n本文',
    });
    expect(result).toEqual({ id: 'k2', konamiId: 2, name: '未収録カード', kind: 'monster',
      monsterTypes: [], attribute: 'water', race: '魚族', atk: null, text: '効果\n本文' });
    expect(buildCardFromDetail(2, 'カード', { attr: '水属性', atk: '100000', levelRank: 'ランク 100000' }))
      .not.toHaveProperty('atk');
    expect(buildCardFromDetail(2, 'カード', { attr: 'WATER', text: '不明' })).toBeNull();
  });

  it.each([['魔法', 'spell'], ['罠', 'trap']])('%sは種別だけを設定する', (attr, kind) => {
    expect(buildCardFromDetail(1, 'カード', { attr, atk: '1000' })).toEqual({
      id: 'k1', konamiId: 1, name: 'カード', kind, monsterTypes: [], text: '',
    });
  });
});

describe('取り込みカードの解決', () => {
  it('cid、正規化名、ページ詳細の順で解決し、区分ごとに合算する', () => {
    const result = resolveImport({ v: 1, source: 'neuron-bookmarklet', cards: [
      { ...card, cid: 12950, name: 'Ash Blossom & Joyous Spring', detail: { attr: '罠' } },
      { ...card, cid: 999999, name: ' 灰流 うらら ', count: 2 },
      { ...card, section: 'side', count: 1 },
      { name: '未収録', cid: 999998, count: 1, section: 'extra', detail: { attr: '光属性', levelRank: 'ランク 4' } },
      { name: '未収録', cid: 999998, count: 2, section: 'extra', detail: { attr: '光属性' } },
    ] }, db);
    expect(result.entries).toEqual([
      { cardId: 'k12950', name: '灰流うらら', count: 5, section: 'main' },
      { cardId: 'k12950', name: '灰流うらら', count: 1, section: 'side' },
      { cardId: 'k999998', name: '未収録', count: 3, section: 'extra' },
    ]);
    expect(Object.keys(result.pageData)).toEqual(['k999998']);
    expect(result.unresolved).toEqual([]);
  });

  it('未解決は入力名を保ち、候補を5件まで検索する', () => {
    const search = vi.fn(db.search);
    const input: ImportPayload = { v: 1, source: 'text', cards: [
      { ...card, name: 'うらら' },
      { ...card, name: '不明', detail: { attr: '魔法' } },
      { ...card, name: '不明2', cid: 99999, detail: { text: '種別なし' } },
    ] };
    const result = resolveImport(input, { ...db, search });
    expect(result.entries).toEqual([]);
    expect(result.pageData).toEqual({});
    expect(result.unresolved.map(item => item.name)).toEqual(['うらら', '不明', '不明2']);
    expect(result.unresolved[0].candidates[0].id).toBe('k12950');
    expect(search).toHaveBeenCalledWith('うらら', 5);
    expect(result.unresolved[0]).toMatchObject({ count: 3, section: 'main' });
  });

  it('合算した枚数を切り捨てずに返す', () => {
    expect(resolveImport({ ...payload, cards: [{ ...card, count: 60 }, card] }, db).entries[0].count).toBe(63);
  });
});
