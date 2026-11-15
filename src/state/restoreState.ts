import { createChoiceDecoder, decodeObject } from '../domain/decoder';
import { APP_SCHEMA_VERSION } from '../domain/limits';
import type { AppState, Result } from '../domain/types';
import { validateAppState } from '../domain/validate';
import type { DroppedReferences } from '../domain/validateReferences';

const LEGACY_SCHEMA_VERSION = 1;

/** 保存 JSON の版を検証し、旧版を現行の型へ移行して復元する。 */
export function readStoredState(
  text: string, isLegacy: boolean,
): Result<{ state: AppState } & DroppedReferences> {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: '保存データの JSON が壊れています。' };
  }
  if (isLegacy) {
    const record = decodeObject(value, 'アプリ状態');
    if (!record.ok) return record;
    const version = createChoiceDecoder([LEGACY_SCHEMA_VERSION])(
      record.value.schemaVersion, 'アプリ状態.schemaVersion',
    );
    if (!version.ok) return version;
    value = { ...record.value, schemaVersion: APP_SCHEMA_VERSION };
  }
  // 欠落項目の補完と参照切れの削除は、通常の復元と同じ検証に任せる。
  return validateAppState(value, { dropDanglingSlots: true });
}

/** 復元で削除した項目を、件数がある種類だけ通知する。 */
export function createRestoreNotice(counts: DroppedReferences): string | null {
  const items = [
    ['スロット', counts.droppedSlots], ['追加の条件', counts.droppedConditions],
    ['ドロー効果', counts.droppedEffects],
  ] as const;
  const removed = items.filter(([, count]) => count > 0)
    .map(([label, count]) => `${label}を ${count} 件`);
  if (removed.length === 0) return null;
  return `参照先のグループがない${removed.join('、')}削除して復元しました。`;
}
