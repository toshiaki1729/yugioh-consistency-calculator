import type { AppState, Deck, Result } from '../domain/types';
import { validateAppState, validateDeck } from '../domain/validate';
import { copyDeckWithNewIds, createInitialState } from './reducer';
import type { StateDependencies } from './reducer';

export const STORAGE_KEY = 'shodou-calc:v1';
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export type StateStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type SaveStatus = 'saved' | 'pending' | 'failed';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function loadState(
  storage: StateStorage, dependencies: StateDependencies = {},
): { state: AppState; notice: string | null; saveBlocked: boolean } {
  let original: string | null;
  try {
    original = storage.getItem(STORAGE_KEY);
  } catch (error) {
    return {
      state: createInitialState(dependencies), saveBlocked: true,
      notice: `保存データを読み取れませんでした。自動保存を停止しています。JSON で書き出してください。${errorMessage(error)}`,
    };
  }
  if (original === null) return { state: createInitialState(dependencies), notice: null, saveBlocked: false };

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
      notice: `保存データの退避に失敗しました。元データを保護するため自動保存を停止しています。JSON で書き出してください。${checked.error} ${errorMessage(error)}`,
    };
  }
  return {
    state: createInitialState(dependencies), saveBlocked: false,
    notice: `読み込めない保存データを「${backupKey}」に退避し、新しいデッキで起動しました。${checked.error}`,
  };
}

export function createSaver(
  storage: StateStorage, { delayMs = 500, saveBlocked = false }: { delayMs?: number; saveBlocked?: boolean } = {},
) {
  let status: SaveStatus = saveBlocked ? 'failed' : 'saved';
  let error: string | null = saveBlocked ? '元データを保護するため自動保存を停止しています。JSON で書き出してください。' : null;
  let pending: AppState | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());

  function flush(): void {
    clearTimeout(timer);
    timer = undefined;
    if (saveBlocked || !pending) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(pending));
      pending = undefined;
      status = 'saved';
      error = null;
    } catch (cause) {
      status = 'failed';
      error = `保存に失敗しました。JSON で書き出してください。${errorMessage(cause)}`;
    }
    notify();
  }

  return {
    schedule(state: AppState): void {
      if (saveBlocked) return;
      clearTimeout(timer);
      pending = state;
      status = 'pending';
      error = null;
      timer = setTimeout(flush, delayMs);
      notify();
    },
    flush,
    getStatus: (): SaveStatus => status,
    getError: (): string | null => error,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export function exportDeckJson(deck: Deck): string {
  return JSON.stringify({ format: 'shodou-calc-deck', version: 1, deck }, null, 2);
}

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

export function importDeckJson(text: string, newId: () => string = () => crypto.randomUUID()): Result<Deck> {
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) {
    return { ok: false, error: 'JSON ファイルは 5MB 以下にしてください。' };
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: 'JSON ファイルを解析できません。形式を確認してください。' };
  }
  if (typeof value !== 'object' || value === null || !('format' in value)
    || value.format !== 'shodou-calc-deck' || !('version' in value) || value.version !== 1 || !('deck' in value)) {
    return { ok: false, error: 'デッキファイルの形式またはバージョンが対応していません。' };
  }
  const checked = validateDeck(value.deck);
  return checked.ok ? { ok: true, value: copyDeckWithNewIds(checked.value, newId) } : checked;
}

export async function importDeckFile(file: File, newId?: () => string): Promise<Result<Deck>> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: 'JSON ファイルは 5MB 以下にしてください。' };
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    return { ok: false, error: `ファイルを読み込めませんでした。${errorMessage(error)}` };
  }
  return importDeckJson(text, newId);
}
