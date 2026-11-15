import type { FilterNode, Predicate, Result } from '../../domain/types';
import { normalizeForMatch } from '../../domain/normalize';
import { MAX_KEYWORD_LENGTH, MAX_NUMERIC_VALUE, MIN_NUMERIC_VALUE } from '../../domain/limits';

/** 条件ビルダーで編集する単独の条件。 */
export interface FilterRow {
  type: 'row';
  pred: Predicate;
  negated: boolean;
}

/** 一段の入れ子として編集する条件のまとまり。 */
export interface FilterGroup {
  type: 'group';
  op: 'and' | 'or';
  rows: FilterRow[];
  negated: boolean;
}

/** 条件ビルダー全体の編集中の値。 */
export interface FilterForm {
  op: 'and' | 'or';
  rows: (FilterRow | FilterGroup)[];
}

/** 選んだ条件の種類に対応する未入力の値を作る。 */
export function defaultPredicate(kind: Predicate['kind']): Predicate {
  switch (kind) {
    case 'nameContains': case 'archetype': case 'mentionsName': return { kind, text: '' };
    case 'textContains': return { kind, text: '', includePendulum: true };
    case 'monsterType': return { kind, values: [], mode: 'any' };
    case 'cardKind': case 'attribute': case 'race': case 'property': return { kind, values: [] };
    case 'cards': return { kind, cardIds: [] };
    case 'level': case 'rank': case 'link': case 'atk': case 'def': case 'scale':
      return { kind, range: {} };
  }
}

/** 条件に含められない未入力・不正値の理由を返す。 */
export function rowError(predicate: Predicate): string | undefined {
  if ('text' in predicate) {
    if (!normalizeForMatch(predicate.text)) return 'キーワードを入力してください';
    if (predicate.text.length > MAX_KEYWORD_LENGTH) return 'キーワードは 100 文字以下にしてください';
  } else if ('range' in predicate) {
    const { min, max } = predicate.range;
    if (min === undefined && max === undefined) return '以上・以下のどちらかを入力してください';
    const hasInvalidBound = [min, max].some(value => value !== undefined
      && (!Number.isInteger(value) || value < MIN_NUMERIC_VALUE || value > MAX_NUMERIC_VALUE));
    if (hasInvalidBound) {
      return '数値は 0〜99999 の整数で入力してください';
    }
    if (min !== undefined && max !== undefined && min > max) return '最小値は最大値以下にしてください';
  } else if (('values' in predicate ? predicate.values : predicate.cardIds).length === 0) {
    return '1 つ以上選んでください';
  }
  return undefined;
}

function parseFormRow(child: FilterNode): Result<FilterRow | FilterGroup, 'unsupported'> {
  const inner = child.op === 'not' ? child.child : child;
  const isNegated = child.op === 'not';
  if (inner.op === 'pred') {
    return { ok: true, value: { type: 'row', pred: inner.pred, negated: isNegated } };
  }
  if (inner.op !== 'and' && inner.op !== 'or') return { ok: false, error: 'unsupported' };
  const rows: FilterRow[] = [];
  for (const groupChild of inner.children) {
    const leaf = groupChild.op === 'not' ? groupChild.child : groupChild;
    if (leaf.op !== 'pred' || (isNegated && groupChild.op === 'not')) {
      return { ok: false, error: 'unsupported' };
    }
    rows.push({ type: 'row', pred: leaf.pred, negated: groupChild.op === 'not' });
  }
  return { ok: true, value: { type: 'group', op: inner.op, rows, negated: isNegated } };
}

/** 保存された条件式を編集可能なフォームへ変換する。 */
export function toForm(node: FilterNode): Result<FilterForm, 'unsupported'> {
  if (node.op !== 'and' && node.op !== 'or') return { ok: false, error: 'unsupported' };
  const rows: FilterForm['rows'] = [];
  for (const child of node.children) {
    const parsed = parseFormRow(child);
    if (!parsed.ok) return parsed;
    rows.push(parsed.value);
  }
  return { ok: true, value: { op: node.op, rows } };
}

/** 未完成の行を除いてフォームを保存用の条件式へ変換する。 */
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
