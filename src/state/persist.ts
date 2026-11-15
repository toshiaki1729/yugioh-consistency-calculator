import { MAX_FILE_BYTES } from '../domain/limits';

import type { AppState, Deck, Result } from '../domain/types';
import { validateAppState, validateDeck } from '../domain/validate';
import { copyDeckWithNewIds, createInitialState } from './reducer';
import type { StateDependencies } from './reducer';

const SAVE_DELAY_MS = 500;
const DECK_FILE_VERSION = 1;
const JSON_INDENT_SPACES = 2;

/** アプリ状態の保存先キー。 */
export const STORAGE_KEY = 'shodou-calc:v1';
export { MAX_FILE_BYTES } from '../domain/limits';
/** 自動保存と復元に必要なストレージ操作。 */
export type StateStorage = Pick<Storage, 'getItem' | 'setItem'>;
/** 自動保存の進行状態。 */
export type SaveStatus = 'saved' | 'pending' | 'failed' | 'conflict';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 保存状態を復元し、壊れたデータは退避する。 */
export function loadState(
  storage: StateStorage, dependencies: StateDependencies = {},
  onRead?: (storedText: string | null) => void,
): { state: AppState; notice: string | null; saveBlocked: boolean } {
  let original: string | null;
  try {
    original = storage.getItem(STORAGE_KEY);
  } catch (error) {
    return {
      state: createInitialState(dependencies), saveBlocked: true,
      notice: `保存データを読み取れませんでした。自動保存を停止しています。JSON で書き出してください。${getErrorMessage(error)}`,
    };
  }
  onRead?.(original);
  if (original === null) return {
    state: createInitialState(dependencies), notice: null, saveBlocked: false,
  };

  let parsed: Result<unknown>;
  try {
    parsed = { ok: true, value: JSON.parse(original) as unknown };
  } catch {
    parsed = { ok: false, error: '保存データの JSON が壊れています。' };
  }
  const checked = parsed.ok ? validateAppState(parsed.value, { dropDanglingSlots: true }) : parsed;
  if (checked.ok) {
    return {
      state: checked.value.state, saveBlocked: false,
      notice: checked.value.droppedSlots > 0
        ? `参照先のグループがないスロットを ${checked.value.droppedSlots} 件削除して復元しました。` : null,
    };
  }

  const backupKey = `${STORAGE_KEY}:broken-${(dependencies.now ?? Date.now)()}`;
  try {
    storage.setItem(backupKey, original);
  } catch (error) {
    return {
      state: createInitialState(dependencies), saveBlocked: true,
      notice: `保存データの退避に失敗しました。元データを保護するため自動保存を停止しています。JSON で書き出してください。${checked.error} ${getErrorMessage(error)}`,
    };
  }
  return {
    state: createInitialState(dependencies), saveBlocked: false,
    notice: `読み込めない保存データを「${backupKey}」に退避し、新しいデッキで起動しました。${checked.error}`,
  };
}

/** 変更の保存予約と状態通知を管理する。 */
export function createSaver(
  storage: StateStorage,
  { delayMs = SAVE_DELAY_MS, saveBlocked: isSaveBlocked = false, storedText }: {
    delayMs?: number; saveBlocked?: boolean; storedText?: string | null;
  } = {},
) {
  let status: SaveStatus = isSaveBlocked ? 'failed' : 'saved';
  let error: string | null = isSaveBlocked ? '元データを保護するため自動保存を停止しています。JSON で書き出してください。' : null;
  let pending: AppState | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());

  if (!isSaveBlocked && storedText === undefined) {
    try {
      storedText = storage.getItem(STORAGE_KEY);
    } catch (cause) {
      isSaveBlocked = true;
      status = 'failed';
      error = `保存データを読み取れませんでした。JSON で書き出してください。${getErrorMessage(cause)}`;
    }
  }

  function markConflict(): void {
    if (isSaveBlocked || status === 'conflict') return;
    clearTimeout(timer);
    timer = undefined;
    pending = undefined;
    status = 'conflict';
    error = null;
    notify();
  }

  function flush(): void {
    clearTimeout(timer);
    timer = undefined;
    if (isSaveBlocked || status === 'conflict' || !pending) return;
    try {
      const text = JSON.stringify(pending);
      if (storage.getItem(STORAGE_KEY) !== storedText) {
        markConflict();
        return;
      }
      storage.setItem(STORAGE_KEY, text);
      storedText = text;
      pending = undefined;
      status = 'saved';
      error = null;
    } catch (cause) {
      status = 'failed';
      error = `保存に失敗しました。JSON で書き出してください。${getErrorMessage(cause)}`;
    }
    notify();
  }

  return {
    schedule(state: AppState): void {
      if (isSaveBlocked || status === 'conflict') return;
      clearTimeout(timer);
      pending = state;
      status = 'pending';
      error = null;
      timer = setTimeout(flush, delayMs);
      notify();
    },
    flush,
    markConflict,
    getStatus: (): SaveStatus => status,
    getError: (): string | null => error,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** デッキを交換用 JSON に変換する。 */
export function exportDeckJson(deck: Deck): string {
  const payload = { format: 'shodou-calc-deck', version: DECK_FILE_VERSION, deck };
  return JSON.stringify(payload, null, JSON_INDENT_SPACES);
}

/** デッキを JSON ファイルとしてダウンロードする。 */
export function downloadDeck(deck: Deck): void {
  const url = URL.createObjectURL(new Blob([exportDeckJson(deck)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${deck.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 交換用 JSON を検証し、編集対象の ID を振り直す。 */
export function importDeckJson(
  text: string, newId: () => string = () => crypto.randomUUID(),
): Result<Deck> {
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) {
    return { ok: false, error: 'JSON ファイルは 5MB 以下にしてください。' };
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: 'JSON ファイルを読み込めません。形式を確認してください。' };
  }
  if (typeof value !== 'object' || value === null || !('format' in value)
    || value.format !== 'shodou-calc-deck' || !('version' in value)
    || value.version !== DECK_FILE_VERSION || !('deck' in value)) {
    return { ok: false, error: 'このデッキファイルの形式またはバージョンには対応していません。' };
  }
  const checked = validateDeck(value.deck);
  return checked.ok ? { ok: true, value: copyDeckWithNewIds(checked.value, newId) } : checked;
}

/** JSON ファイルを読み込み、デッキとして検証する。 */
export async function importDeckFile(file: File, newId?: () => string): Promise<Result<Deck>> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: 'JSON ファイルは 5MB 以下にしてください。' };
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    return { ok: false, error: `ファイルを読み込めませんでした。${getErrorMessage(error)}` };
  }
  return importDeckJson(text, newId);
}
