import { describe, expect, it } from 'vitest';
import { normalizeForMatch, normalizeForSearch, normalizeKana } from '../src/domain/normalize';

describe('かなの正規化', () => {
  it.each([
    ['ァ', 'ぁ'], ['ア', 'あ'], ['ヴ', 'ゔ'], ['ヵ', 'ゕ'], ['ヶ', 'ゖ'],
    ['ヽ', 'ゝ'], ['ヾ', 'ゞ'], ['ー', 'ー'], ['ヷヸヹヺ', 'ヷヸヹヺ'],
    ['ﾌﾞﾙｰ', 'ぶるー'], ['ブルー', 'ぶるー'], ['ぶるー', 'ぶるー'],
    ['　Ｎｏ．３９ \t Ｌ召喚\n１５００', 'no.39l召喚1500'],
    ['.*+?^${}()|[]\\', '.*+?^${}()|[]\\'], ['漢字ABC123', '漢字abc123'],
  ])('%s → %s（両方の新しい正規化）', (input, expected) => {
    expect(normalizeKana(input)).toBe(expected);
    expect(normalizeForSearch(input)).toBe(expected);
    expect(normalizeKana(expected)).toBe(expected);
    expect(normalizeForSearch(expected)).toBe(expected);
  });

  it.each(['・', '･', '－', '-', '‐', '‑', '‒', '–', '—', '―', '−', '＝', '='])(
    '区切り %s は検索だけで除く', separator => {
      expect(normalizeKana(separator)).toBe(normalizeForMatch(separator));
      expect(normalizeForSearch(separator)).toBe('');
      expect(normalizeKana(`ア${separator}イ`)).toBe(`あ${normalizeForMatch(separator)}い`);
      expect(normalizeForSearch(`ア${separator}イ`)).toBe('あい');
    },
  );

  it('既存の正規化はかな・区切りを保持する', () => {
    expect(normalizeForMatch(' Ｅ－ＨＥＲＯ・ﾌﾞﾙｰ＝１２３ ')).toBe('e-hero・ブルー=123');
    expect(normalizeKana(' Ｅ－ＨＥＲＯ・ﾌﾞﾙｰ＝１２３ ')).toBe('e-hero・ぶるー=123');
    expect(normalizeForSearch(' Ｅ－ＨＥＲＯ・ﾌﾞﾙｰ＝１２３ ')).toBe('eheroぶるー123');
  });
});
