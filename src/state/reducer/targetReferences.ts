import type { CardTarget, DrawEffect } from '../../domain/types';

/** 参照するグループまたはカードが同じかを判定する。 */
export function isSameTarget(source: CardTarget, target: CardTarget): boolean {
  if (source.type === 'group' && target.type === 'group') {
    return source.groupId === target.groupId;
  }
  return source.type === 'card' && target.type === 'card' && source.cardId === target.cardId;
}

/** 対象を参照する手順が効果に一つでも含まれるかを判定する。 */
export function hasEffectTarget(effect: DrawEffect, target: CardTarget): boolean {
  return effect.steps.some(step =>
    'target' in step && step.target !== null && isSameTarget(step.target, target));
}
