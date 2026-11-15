import type { FilterNode, Predicate, Result } from '../../domain/types';
import { normalizeForMatch } from '../../domain/normalize';

export interface FilterRow {
  type: 'row';
  pred: Predicate;
  negated: boolean;
}

export interface FilterGroup {
  type: 'group';
  op: 'and' | 'or';
  rows: FilterRow[];
  negated: boolean;
}

export interface FilterForm {
  op: 'and' | 'or';
  rows: (FilterRow | FilterGroup)[];
}

export function defaultPredicate(kind: Predicate['kind']): Predicate {
  switch (kind) {
    case 'nameContains': case 'archetype': case 'mentionsName': return { kind, text: '' };
    case 'textContains': return { kind, text: '', includePendulum: true };
    case 'monsterType': return { kind, values: [], mode: 'any' };
    case 'cardKind': case 'attribute': case 'race': case 'property': return { kind, values: [] };
    case 'cards': return { kind, cardIds: [] };
    case 'level': case 'rank': case 'link': case 'atk': case 'def': case 'scale': return { kind, range: {} };
  }
}

export function rowError(pred: Predicate): string | undefined {
  if ('text' in pred) {
    if (!normalizeForMatch(pred.text)) return 'キーワードを入力してください';
    if (pred.text.length > 100) return 'キーワードは100文字以下にしてください';
  } else if ('range' in pred) {
    const { min, max } = pred.range;
    if (min === undefined && max === undefined) return '以上・以下のどちらかを入力してください';
    if ([min, max].some(value => value !== undefined && (!Number.isInteger(value) || value < 0 || value > 99999))) {
      return '数値は0〜99999の整数で入力してください';
    }
    if (min !== undefined && max !== undefined && min > max) return '最小値は最大値以下にしてください';
  } else if (('values' in pred ? pred.values : pred.cardIds).length === 0) {
    return '1つ以上選んでください';
  }
  return undefined;
}

export function toForm(node: FilterNode): Result<FilterForm, 'unsupported'> {
  if (node.op !== 'and' && node.op !== 'or') return { ok: false, error: 'unsupported' };
  const rows: FilterForm['rows'] = [];
  for (const child of node.children) {
    const inner = child.op === 'not' ? child.child : child;
    const negated = child.op === 'not';
    if (inner.op === 'pred') rows.push({ type: 'row', pred: inner.pred, negated });
    else if (inner.op === 'and' || inner.op === 'or') {
      const groupRows: FilterRow[] = [];
      for (const groupChild of inner.children) {
        const leaf = groupChild.op === 'not' ? groupChild.child : groupChild;
        if (leaf.op !== 'pred' || (negated && groupChild.op === 'not')) return { ok: false, error: 'unsupported' };
        groupRows.push({ type: 'row', pred: leaf.pred, negated: groupChild.op === 'not' });
      }
      rows.push({ type: 'group', op: inner.op, rows: groupRows, negated });
    } else return { ok: false, error: 'unsupported' };
  }
  return { ok: true, value: { op: node.op, rows } };
}

export function fromForm(form: FilterForm): FilterNode {
  function convertRow(row: FilterRow): FilterNode[] {
    if (rowError(row.pred)) return [];
    const node: FilterNode = { op: 'pred', pred: row.pred };
    return [row.negated ? { op: 'not', child: node } : node];
  }
  return {
    op: form.op,
    children: form.rows.flatMap((row): FilterNode[] => {
      if (row.type === 'row') return convertRow(row);
      const children = row.rows.flatMap(convertRow);
      if (children.length === 0) return [];
      const node: FilterNode = { op: row.op, children };
      return [row.negated ? { op: 'not', child: node } : node];
    }),
  };
}
