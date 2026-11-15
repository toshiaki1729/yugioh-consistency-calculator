import type { Result, Section } from '../domain/types';
import {
  MAX_CARD_NAME_LENGTH, MAX_ENTRIES, MAX_ENTRY_COUNT, MAX_TITLE_LENGTH,
  MIN_ENTRY_COUNT, MIN_KONAMI_ID, MIN_NAME_LENGTH,
} from '../domain/limits';

const MAX_DETAIL_LENGTH = 2000;

/** 公式ページから取得するカードの補助情報。 */
export interface ImportDetail {
  attr?: string;
  levelRank?: string;
  species?: string;
  atk?: string;
  def?: string;
  text?: string;
}

/** ブックマークレットとテキストで共通の取り込み形式。 */
export interface ImportPayload {
  v: 1;
  source: 'neuron-bookmarklet' | 'text';
  deckName?: string;
  cards: { cid?: number; name: string; count: number; section: Section; detail?: ImportDetail }[];
}

/** デコード前の取り込み文字列の上限。 */
export const MAX_IMPORT_LENGTH = 200_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 外部の取り込みデータを検証し、必要な項目だけを返す。 */
export function validatePayload(value: unknown): Result<ImportPayload> {
  if (!isRecord(value) || value.v !== 1
    || (value.source !== 'neuron-bookmarklet' && value.source !== 'text')) {
    return { ok: false, error: '取り込みデータの形式・バージョン・出典が不正です' };
  }
  if (value.deckName !== undefined && (typeof value.deckName !== 'string'
    || value.deckName.length < MIN_NAME_LENGTH || value.deckName.length > MAX_TITLE_LENGTH)) {
    return { ok: false, error: '取り込みデータのデッキ名は 1〜50 文字で指定してください' };
  }
  if (!Array.isArray(value.cards) || value.cards.length < 1 || value.cards.length > MAX_ENTRIES) {
    return { ok: false, error: '取り込みデータのカードは 1〜200 件で指定してください' };
  }
  const cards: ImportPayload['cards'] = [];
  for (let i = 0; i < value.cards.length; i++) {
    const result = validateImportCard(value.cards[i], `取り込みデータのカード ${i + 1} 件目`);
    if (!result.ok) return result;
    cards.push(result.value);
  }
  const payload: ImportPayload = { v: 1, source: value.source, cards };
  if (value.deckName !== undefined) payload.deckName = value.deckName as string;
  return { ok: true, value: payload };
}

/** 取り込みデータをUTF-8のbase64urlに変換する。 */
export function encodePayload(payload: ImportPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** URLハッシュのデータを復号して検証する。 */
export function decodePayload(encoded: string): Result<ImportPayload> {
  if (encoded.length > MAX_IMPORT_LENGTH) {
    return { ok: false, error: '取り込み文字列は 200,000 文字以下にしてください' };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
    return { ok: false, error: '取り込みデータの base64url が不正です' };
  }
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    if (btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== encoded) {
      return { ok: false, error: '取り込みデータの base64url が不正です' };
    }
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return validatePayload(JSON.parse(json));
  } catch {
    return { ok: false, error: '取り込みデータを UTF-8 の JSON として読み込めません' };
  }
}

function validateImportCard(
  input: unknown, path: string,
): Result<ImportPayload['cards'][number]> {
  if (!isRecord(input)) return { ok: false, error: `${path}: オブジェクトで指定してください` };
  if (typeof input.name !== 'string'
    || input.name.length < MIN_NAME_LENGTH || input.name.length > MAX_CARD_NAME_LENGTH) {
    return { ok: false, error: `${path}: カード名は 1〜100 文字で指定してください` };
  }
  if (typeof input.count !== 'number' || !Number.isInteger(input.count)
    || input.count < MIN_ENTRY_COUNT || input.count > MAX_ENTRY_COUNT) {
    return { ok: false, error: `${path}: 枚数は 1〜60 の整数で指定してください` };
  }
  if (input.section !== 'main' && input.section !== 'extra' && input.section !== 'side') {
    return { ok: false, error: `${path}: 区分は main / extra / side のいずれかで指定してください` };
  }
  if (input.cid !== undefined && (typeof input.cid !== 'number'
    || !Number.isSafeInteger(input.cid) || input.cid < MIN_KONAMI_ID)) {
    return { ok: false, error: `${path}: cid は正の整数で指定してください` };
  }
  const card: ImportPayload['cards'][number] = {
    name: input.name, count: input.count, section: input.section,
  };
  if (input.cid !== undefined) card.cid = input.cid as number;
  if (input.detail !== undefined) {
    const result = validateImportDetail(input.detail, path);
    if (!result.ok) return result;
    card.detail = result.value;
  }
  return { ok: true, value: card };
}

function validateImportDetail(input: unknown, path: string): Result<ImportDetail> {
  if (!isRecord(input)) return { ok: false, error: `${path}: detail の形式が不正です` };
  const detail: ImportDetail = {};
  for (const key of ['attr', 'levelRank', 'species', 'atk', 'def', 'text'] as const) {
    const field = input[key];
    if (field === undefined) continue;
    if (typeof field !== 'string' || field.length > MAX_DETAIL_LENGTH) {
      return { ok: false, error: `${path}: detail.${key} は 2000 文字以下の文字列で指定してください` };
    }
    detail[key] = field;
  }
  return { ok: true, value: detail };
}
