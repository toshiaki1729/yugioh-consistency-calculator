import { normalizeForMatch } from '../domain/normalize';
import {
  MAX_CARD_NAME_LENGTH, MAX_ENTRIES, MAX_ENTRY_COUNT, MAX_IMPORT_LINE_LENGTH, MIN_ENTRY_COUNT,
} from '../domain/limits';
import type { Section } from '../domain/types';
import { MAX_IMPORT_LENGTH, validatePayload } from './payload';
import type { ImportPayload } from './payload';

/** 貼り付けの解析結果と行番号付きのエラー。 */
export interface ParsedDeckText {
  payload: ImportPayload | null;
  errors: { line: number; message: string }[];
}

/** 貼り付けたJSONまたはカード一覧を取り込み形式に解析する。 */
export function parseDeckText(
  text: string, isKnownName: (name: string) => boolean,
): ParsedDeckText {
  if (text.length > MAX_IMPORT_LENGTH) {
    return { payload: null, errors: [{ line: 1, message: '取り込み文字列は 200,000 文字以下にしてください' }] };
  }
  if (text.trimStart().startsWith('{')) return parseJsonText(text);
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
    if (lines[i].length > MAX_IMPORT_LINE_LENGTH) {
      errors.push({ line: i + 1, message: `1 行は ${MAX_IMPORT_LINE_LENGTH} 文字以下にしてください` });
      continue;
    }
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const heading = normalizeForMatch(line.replace(/[【】\[\]［］<>＜＞■◆●#＃:：\-－=＝\s]/g, ''));
    if (Object.hasOwn(headings, heading)) {
      section = headings[heading];
      continue;
    }
    const { name, count } = parseCardLine(line, isKnownName);
    if (!name || name.length > MAX_CARD_NAME_LENGTH) {
      errors.push({ line: i + 1, message: 'カード名は 1〜100 文字で指定してください' });
    } else if (!Number.isInteger(count) || count < MIN_ENTRY_COUNT || count > MAX_ENTRY_COUNT) {
      errors.push({ line: i + 1, message: '枚数は 1〜60 の整数で指定してください' });
    } else if (cards.length >= MAX_ENTRIES) {
      errors.push({ line: i + 1, message: 'カードの件数は 200 件以下にしてください' });
    } else cards.push({ name, count, section });
  }
  if (!cards.length && !errors.length) errors.push({ line: 1, message: 'カードの行を入力してください' });
  return { payload: errors.length ? null : { v: 1, source: 'text', cards }, errors };
}

function parseJsonText(text: string): ParsedDeckText {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return { payload: null, errors: [{ line: 1, message: '取り込み JSON を読み込めません' }] };
  }
  const result = validatePayload(input);
  return result.ok ? { payload: result.value, errors: [] }
    : { payload: null, errors: [{ line: 1, message: result.error }] };
}

function parseCardLine(line: string, isKnownName: (name: string) => boolean) {
  if (isKnownName(line)) return { name: line, count: 1 };
  const prefix = line.match(/^([+-]?[0-9０-９]+)\s+/);
  if (prefix) {
    return {
      name: line.slice(prefix[0].length).trim(), count: Number(prefix[1].normalize('NFKC')),
    };
  }
  let numberStart = line.length;
  while (numberStart > 0 && /[0-9０-９]/.test(line[numberStart - 1])) numberStart--;
  if (numberStart === line.length) return { name: line, count: 1 };
  if (numberStart > 0 && /[+-]/.test(line[numberStart - 1])) numberStart--;
  const beforeNumber = line.slice(0, numberStart);
  const name = beforeNumber.trimEnd();
  const count = Number(line.slice(numberStart).normalize('NFKC'));
  if (/[x×*]$/i.test(name)) return { name: name.slice(0, -1).trim(), count };
  const separator = beforeNumber.slice(name.length);
  if (separator.includes('\t') || (separator.length > 0 && isKnownName(name))) {
    return { name, count };
  }
  return { name: line, count: 1 };
}
