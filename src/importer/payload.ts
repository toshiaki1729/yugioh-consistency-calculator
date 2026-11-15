import type { Result, Section } from '../domain/types';

export interface ImportDetail {
  attr?: string;
  levelRank?: string;
  species?: string;
  atk?: string;
  def?: string;
  text?: string;
}

export interface ImportPayload {
  v: 1;
  source: 'neuron-bookmarklet' | 'text';
  deckName?: string;
  cards: { cid?: number; name: string; count: number; section: Section; detail?: ImportDetail }[];
}

export const MAX_IMPORT_LENGTH = 200_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validatePayload(value: unknown): Result<ImportPayload> {
  if (!isRecord(value) || value.v !== 1
    || (value.source !== 'neuron-bookmarklet' && value.source !== 'text')) {
    return { ok: false, error: '取り込みデータの形式・バージョン・出典が不正です' };
  }
  if (value.deckName !== undefined && (typeof value.deckName !== 'string'
    || value.deckName.length < 1 || value.deckName.length > 50)) {
    return { ok: false, error: '取り込みデータのデッキ名は1〜50文字で指定してください' };
  }
  if (!Array.isArray(value.cards) || value.cards.length < 1 || value.cards.length > 200) {
    return { ok: false, error: '取り込みデータのカードは1〜200件で指定してください' };
  }
  const cards: ImportPayload['cards'] = [];
  for (let i = 0; i < value.cards.length; i++) {
    const input: unknown = value.cards[i];
    const path = `取り込みデータのカード${i + 1}件目`;
    if (!isRecord(input)) return { ok: false, error: `${path}: カードをオブジェクトで指定してください` };
    if (typeof input.name !== 'string' || input.name.length < 1 || input.name.length > 100) {
      return { ok: false, error: `${path}: カード名は1〜100文字で指定してください` };
    }
    if (typeof input.count !== 'number' || !Number.isInteger(input.count) || input.count < 1 || input.count > 60) {
      return { ok: false, error: `${path}: 枚数は1〜60の整数で指定してください` };
    }
    if (input.section !== 'main' && input.section !== 'extra' && input.section !== 'side') {
      return { ok: false, error: `${path}: 区分はmain / extra / sideで指定してください` };
    }
    if (input.cid !== undefined && (typeof input.cid !== 'number' || !Number.isSafeInteger(input.cid) || input.cid < 1)) {
      return { ok: false, error: `${path}: cidは正の安全な整数で指定してください` };
    }
    const card: ImportPayload['cards'][number] = { name: input.name, count: input.count, section: input.section };
    if (input.cid !== undefined) card.cid = input.cid as number;
    if (input.detail !== undefined) {
      if (!isRecord(input.detail)) return { ok: false, error: `${path}: detailの形式が不正です` };
      const detail: ImportDetail = {};
      for (const key of ['attr', 'levelRank', 'species', 'atk', 'def', 'text'] as const) {
        const field = input.detail[key];
        if (field === undefined) continue;
        if (typeof field !== 'string' || field.length > 2000) {
          return { ok: false, error: `${path}: detail.${key}は2000文字以下の文字列で指定してください` };
        }
        detail[key] = field;
      }
      card.detail = detail;
    }
    cards.push(card);
  }
  const payload: ImportPayload = { v: 1, source: value.source, cards };
  if (value.deckName !== undefined) payload.deckName = value.deckName as string;
  return { ok: true, value: payload };
}

export function encodePayload(payload: ImportPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodePayload(encoded: string): Result<ImportPayload> {
  if (encoded.length > MAX_IMPORT_LENGTH) return { ok: false, error: '取り込み文字列は200,000文字以下にしてください' };
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
    return { ok: false, error: '取り込みデータのbase64urlが不正です' };
  }
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    if (btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== encoded) {
      return { ok: false, error: '取り込みデータのbase64urlが不正です' };
    }
    const json = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
    return validatePayload(JSON.parse(json));
  } catch {
    return { ok: false, error: '取り込みデータをUTF-8のJSONとして読み込めません' };
  }
}
