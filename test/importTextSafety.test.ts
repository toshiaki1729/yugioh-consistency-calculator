import { describe, expect, it, vi } from 'vitest';
import { MAX_IMPORT_LINE_LENGTH } from '../src/domain/limits';
import { normalizeForMatch } from '../src/domain/normalize';
import { parseDeckText } from '../src/importer/text';

const knownNames = ['灰流うらら', '青眼の白龍', 'Ｎｏ．３９ 希望皇ホープ', 'カード 3', '3 カード x2'];
const isKnownName = (name: string) => knownNames.some(known =>
  normalizeForMatch(known) === normalizeForMatch(name));

describe('貼り付け解析の長さと処理時間', () => {
  it.each([
    ['空白を挟む1行', 'A' + ' '.repeat(199_998) + '!'],
    ['空白だけの1行', ' '.repeat(200_000)],
    ['長い行200行', ('A' + ' '.repeat(997) + '!\n').repeat(200)],
  ])('%s の200,000文字を200ms以内に拒否する', (_label, input) => {
    expect(input.length).toBe(200_000);
    const lookup = vi.fn(() => false);
    const start = performance.now();
    const result = parseDeckText(input, lookup);
    const elapsedMs = performance.now() - start;
    expect(elapsedMs).toBeLessThan(200);
    expect(result.payload).toBeNull();
    const errorCount = input.includes('\n') ? 200 : 1;
    expect(result.errors).toEqual(Array.from({ length: errorCount }, (_, index) => ({
      line: index + 1, message: `1 行は ${MAX_IMPORT_LINE_LENGTH} 文字以下にしてください`,
    })));
    expect(lookup).not.toHaveBeenCalled();
  });

  it('200文字を許可し、201文字では行番号を保って全体を拒否する', () => {
    const atLimit = 'A' + ' '.repeat(MAX_IMPORT_LINE_LENGTH - 3) + 'x3';
    expect(parseDeckText(atLimit, isKnownName).payload?.cards[0]).toMatchObject({ name: 'A', count: 3 });
    const result = parseDeckText(`灰流うらら\r\n${atLimit} \r青眼の白龍`, isKnownName);
    expect(result.payload).toBeNull();
    expect(result.errors).toEqual([{ line: 2, message: '1 行は 200 文字以下にしてください' }]);
  });
});

describe('枚数の解析書式と優先順位', () => {
  it.each([
    ['3 灰流うらら', '灰流うらら', 3], ['３　灰流うらら', '灰流うらら', 3],
    ['+3 灰流うらら', '灰流うらら', 3], ['+３ 灰流うらら', '灰流うらら', 3],
    ['青眼の白龍 x3', '青眼の白龍', 3], ['青眼の白龍×３', '青眼の白龍', 3],
    ['青眼の白龍 X +３', '青眼の白龍', 3], ['青眼の白龍 * 3', '青眼の白龍', 3],
    ['未知\t３', '未知', 3], ['未知\t  +３', '未知', 3], ['未知 \t \t3', '未知', 3],
    ['灰流うらら ３', '灰流うらら', 3], ['未知 3', '未知 3', 1],
    ['Ｎｏ．３９ 希望皇ホープ', 'Ｎｏ．３９ 希望皇ホープ', 1], ['カード 3', 'カード 3', 1],
    ['3 カード x2', '3 カード x2', 1], ['3 未知 x2', '未知 x2', 3],
    ['未知 x 3', '未知', 3], ['未知\tx3', '未知', 3],
    ['未知3', '未知3', 1], ['未知 +3', '未知 +3', 1],
    ['エクストラ・ヴェーラー', 'エクストラ・ヴェーラー', 1],
  ])('%s', (text, name, count) => {
    expect(parseDeckText(text, isKnownName)).toEqual({
      payload: { v: 1, source: 'text', cards: [{ name, count, section: 'main' }] }, errors: [],
    });
  });

  it.each(['-1 灰流うらら', '0 灰流うらら', '61 灰流うらら', '青眼の白龍 x-１',
    '青眼の白龍×０', '青眼の白龍*61', '未知\t-1', '灰流うらら -１', '灰流うらら +61'])
  ('範囲外の枚数を拒否する: %s', text => {
    expect(parseDeckText(text, isKnownName)).toEqual({
      payload: null, errors: [{ line: 1, message: '枚数は 1〜60 の整数で指定してください' }],
    });
  });

  it('見出しとコメントの扱いを保ち、継承プロパティ名を見出しにしない', () => {
    const result = parseDeckText('# コメント\n【メイン】\n灰流うらら\n＜ＥＸ＞\n青眼の白龍\n[side]\ntoString', isKnownName);
    expect(result.errors).toEqual([]);
    expect(result.payload?.cards.map(card => [card.name, card.section])).toEqual([
      ['灰流うらら', 'main'], ['青眼の白龍', 'extra'], ['toString', 'side'],
    ]);
  });
});
