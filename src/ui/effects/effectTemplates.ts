import type { EffectDraft } from './effectForm';

/** カードを変えずに設定と手順を置き換えるひな形。 */
export type EffectTemplate = { name: string; settings: Omit<EffectDraft, 'cardId'> };

/** 汎用のドロー効果を入力するための設定と手順。 */
export const EFFECT_TEMPLATES: EffectTemplate[] = [
  { name: '1 枚ドロー', settings: {
    oncePerTurn: false, firstOnly: false, drawLock: 'none',
    steps: [{ kind: 'draw', count: 1 }],
  } },
  { name: '上から除外して 2 枚ドロー', settings: {
    oncePerTurn: true, firstOnly: false, drawLock: 'none',
    steps: [{ kind: 'banishTop', count: 10 }, { kind: 'draw', count: 2 }],
  } },
  { name: 'めくって 1 枚を手札に', settings: {
    oncePerTurn: true, firstOnly: false, drawLock: 'turn',
    steps: [{ kind: 'excavate', count: 6, target: null }],
  } },
  { name: '2 枚ドローして手札から 1 枚除外', settings: {
    oncePerTurn: false, firstOnly: false, drawLock: 'none',
    steps: [{ kind: 'draw', count: 2 },
      { kind: 'handCost', target: null, destination: 'banishedFaceUp' }],
  } },
  { name: 'サーチして 1 枚ドロー', settings: {
    oncePerTurn: true, firstOnly: false, drawLock: 'none',
    steps: [{ kind: 'search', target: null }, { kind: 'draw', count: 1 }],
  } },
];
