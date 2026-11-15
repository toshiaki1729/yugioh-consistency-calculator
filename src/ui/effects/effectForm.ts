import { MIN_BANISH_COUNT, MIN_DRAW_COUNT, MIN_EXCAVATE_COUNT } from '../../domain/limits';
import type { CardTarget, DrawEffect, EffectStep } from '../../domain/types';
import type { SlotOption } from '../patterns/SlotRow';

/** 対象の未設定を画面内だけで保持する手順。 */
export type StepDraft = Exclude<EffectStep, { kind: 'search' | 'handCost' }>
  | { kind: 'search'; target: CardTarget | null }
  | { kind: 'handCost'; target: CardTarget | null;
    destination: 'graveyard' | 'banishedFaceUp' };

/** 対象未設定の手順を含めて保持する効果の編集内容。 */
export type EffectDraft = Omit<DrawEffect, 'id' | 'steps'> & { steps: StepDraft[] };

const DEFAULT_DESTINATION = 'graveyard';

/** 手順の種類の表示名。 */
export const stepLabels: Record<EffectStep['kind'], string> = {
  draw: 'ドロー', banishTop: 'デッキの上から除外', excavate: 'めくって 1 枚を手札に',
  search: 'サーチ', handCost: '手札から 1 枚を手放す',
};

/** ドロー制限の表示名。 */
export const drawLockLabels: Record<DrawEffect['drawLock'], string> = {
  none: 'なし', after: '使った後はドローできない',
  turn: '効果でドローした後は使えず、使った後もドローできない',
};

/** 種類変更時の手順を既定値で作る。 */
export function createDefaultStep(kind: EffectStep['kind'], sources: SlotOption[]): StepDraft {
  switch (kind) {
    case 'draw': return { kind, count: MIN_DRAW_COUNT };
    case 'banishTop': return { kind, count: MIN_BANISH_COUNT };
    case 'excavate': return { kind, count: MIN_EXCAVATE_COUNT, target: null };
    case 'search': return { kind, target: sources[0]?.source ?? null };
    case 'handCost': return { kind, target: sources[0]?.source ?? null,
      destination: DEFAULT_DESTINATION };
  }
}

/** 対象が確定し、現在の選択肢に存在する手順か調べる。 */
export function isStepReady(step: StepDraft, sources: SlotOption[]): step is EffectStep {
  if (!('target' in step)) return true;
  if (!step.target) return step.kind === 'excavate';
  const target = step.target;
  const value = target.type === 'group' ? `group:${target.groupId}` : `card:${target.cardId}`;
  return sources.some(source => source.value === value);
}

/** 保存済みの手順を一覧用の短い説明にする。 */
export function summarizeStep(step: EffectStep): string {
  switch (step.kind) {
    case 'draw': return `${step.count} 枚ドロー`;
    case 'banishTop': return `デッキの上から ${step.count} 枚を除外`;
    case 'excavate': return `${step.count} 枚めくって 1 枚を手札に`;
    case 'search': return 'サーチ';
    case 'handCost': return step.destination === 'graveyard'
      ? '手札から 1 枚を墓地へ送る' : '手札から 1 枚を表側で除外';
  }
}
