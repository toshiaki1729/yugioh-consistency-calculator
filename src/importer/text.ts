import { normalizeForMatch } from '../domain/normalize';
import type { Section } from '../domain/types';
import { MAX_IMPORT_LENGTH, validatePayload } from './payload';
import type { ImportPayload } from './payload';

export interface ParsedDeckText {
  payload: ImportPayload | null;
  errors: { line: number; message: string }[];
}

export function parseDeckText(text: string, isKnownName: (name: string) => boolean): ParsedDeckText {
  if (text.length > MAX_IMPORT_LENGTH) {
    return { payload: null, errors: [{ line: 1, message: '取り込み文字列は200,000文字以下にしてください' }] };
  }
  if (text.trimStart().startsWith('{')) {
    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch {
      return { payload: null, errors: [{ line: 1, message: '取り込みJSONを読み込めません' }] };
    }
    const result = validatePayload(input);
    return result.ok ? { payload: result.value, errors: [] }
      : { payload: null, errors: [{ line: 1, message: result.error }] };
  }
  const headings: Record<string, Section> = {
    メイン: 'main', メインデッキ: 'main', main: 'main',
    エクストラ: 'extra', エクストラデッキ: 'extra', ex: 'extra', exデッキ: 'extra', extra: 'extra',
    サイド: 'side', サイドデッキ: 'side', side: 'side',
  };
  let section: Section = 'main';
  const cards: ImportPayload['cards'] = [];
  const errors: ParsedDeckText['errors'] = [];
  const lines = text.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const heading = normalizeForMatch(line.replace(/[【】\[\]［］<>＜＞■◆●#＃:：\-－=＝\s]/g, ''));
    if (Object.hasOwn(headings, heading)) {
      section = headings[heading];
      continue;
    }
    let name = line;
    let count = 1;
    if (!isKnownName(line)) {
      const prefix = line.match(/^([+-]?[0-9０-９]+)\s+(.*)$/);
      const suffix = line.match(/^(.*?)\s*[x×*]\s*([+-]?[0-9０-９]+)$/i);
      const tab = line.match(/^(.*?)\t\s*([+-]?[0-9０-９]+)$/);
      const trailing = line.match(/^(.*?)\s+([+-]?[0-9０-９]+)$/);
      if (prefix) {
        name = prefix[2].trim();
        count = Number(prefix[1].normalize('NFKC'));
      } else {
        const match = suffix ?? tab ?? (trailing && isKnownName(trailing[1].trim()) ? trailing : null);
        if (match) {
          name = match[1].trim();
          count = Number(match[2].normalize('NFKC'));
        }
      }
    }
    if (!name || name.length > 100) errors.push({ line: i + 1, message: 'カード名は1〜100文字で指定してください' });
    else if (!Number.isInteger(count) || count < 1 || count > 60) errors.push({ line: i + 1, message: '枚数は1〜60の整数で指定してください' });
    else if (cards.length >= 200) errors.push({ line: i + 1, message: 'カードの件数は200件以下にしてください' });
    else cards.push({ name, count, section });
  }
  if (!cards.length && !errors.length) errors.push({ line: 1, message: 'カードの行を入力してください' });
  return { payload: errors.length ? null : { v: 1, source: 'text', cards }, errors };
}
