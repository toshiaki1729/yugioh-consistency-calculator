import { describe, expect, it } from 'vitest';
import type { FilterNode, Predicate } from '../src/domain/types';
import { validateFilter } from '../src/domain/validate';
import { defaultPredicate, fromForm, rowError, toForm } from '../src/ui/groups/filterForm';
import type { FilterForm } from '../src/ui/groups/filterForm';

const predicates: Predicate[] = [
  { kind: 'cardKind', values: ['monster', 'spell'] },
  { kind: 'monsterType', values: ['effect', 'tuner'], mode: 'any' },
  { kind: 'monsterType', values: ['effect', 'tuner'], mode: 'all' },
  { kind: 'attribute', values: ['dark', 'light'] },
  { kind: 'race', values: ['ドラゴン族', '魔法使い族'] },
  { kind: 'level', range: { max: 4 } },
  { kind: 'rank', range: { min: 0 } },
  { kind: 'link', range: { min: 1, max: 3 } },
  { kind: 'atk', range: { max: 1500 } },
  { kind: 'def', range: { min: 0, max: 99999 } },
  { kind: 'scale', range: { min: 5, max: 5 } },
  { kind: 'property', values: ['normal', 'quickplay', 'counter'] },
  { kind: 'nameContains', text: '青眼' },
  { kind: 'textContains', text: '特殊召喚', includePendulum: true },
  { kind: 'textContains', text: '特殊召喚', includePendulum: false },
  { kind: 'archetype', text: 'ブルーアイズ' },
  { kind: 'mentionsName', text: '青眼の白龍' },
  { kind: 'cards', cardIds: ['k4007', 'c:custom'] },
];

describe('条件フォームの変換', () => {
  it.each(predicates)('$kind を直接・否定・まとまり内・否定したまとまり内で往復できる (%#)', pred => {
    for (const op of ['and', 'or'] as const) {
      const leaf: FilterNode = { op: 'pred', pred };
      const not: FilterNode = { op: 'not', child: leaf };
      const node: FilterNode = { op, children: [leaf, not,
        { op: 'and', children: [leaf, not] },
        { op: 'not', child: { op: 'or', children: [leaf] } },
      ] };
      const snapshot = JSON.stringify(node);
      const form = toForm(node);
      expect(form.ok).toBe(true);
      if (!form.ok) return;
      expect(fromForm(form.value)).toEqual(node);
      expect(validateFilter(fromForm(form.value)).ok).toBe(true);
      expect(JSON.stringify(node)).toBe(snapshot);
    }
  });

  it.each<FilterNode>([
    { op: 'and', children: [] }, { op: 'or', children: [] },
  ])('最上位の空の論理ノードは保存する (%#)', node => {
    const form = toForm(node);
    expect(form.ok && fromForm(form.value)).toEqual(node);
  });

  const leaf: FilterNode = { op: 'pred', pred: { kind: 'level', range: { max: 4 } } };
  it.each(['and', 'or'] as const)('否定した%sまとまり内の否定行（深さ5）を拒否する', op => {
    const node: FilterNode = { op: 'and', children: [
      { op: 'not', child: { op, children: [{ op: 'not', child: leaf }] } },
    ] };
    expect(validateFilter(node).ok).toBe(false);
    expect(toForm(node)).toEqual({ ok: false, error: 'unsupported' });
  });

  it.each(['and', 'or'] as const)('最上位%sで、空または不正行だけのまとまりは否定の有無によらず除く', rootOp => {
    for (const op of ['and', 'or'] as const) {
      for (const negated of [false, true]) {
        const node: FilterNode = { op: rootOp, children: [leaf,
          negated ? { op: 'not', child: { op, children: [] } } : { op, children: [] },
        ] };
        const parsed = toForm(node);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const form = parsed.value;
        const expected = { op: rootOp, children: [leaf] };
        expect(fromForm(form)).toEqual(expected);
        const group = form.rows[1];
        if (group.type !== 'group') throw new Error('まとまりが必要です');
        group.rows = [
          { type: 'row', negated: false, pred: { kind: 'nameContains', text: '' } },
          { type: 'row', negated: false, pred: { kind: 'level', range: { min: 5, max: 4 } } },
          { type: 'row', negated: false, pred: { kind: 'cardKind', values: [] } },
        ];
        expect(fromForm(form)).toEqual(expected);
        expect(group.rows).toHaveLength(3);
        group.rows.push({ type: 'row', negated: false, pred: { kind: 'level', range: { max: 4 } } });
        const validGroup: FilterNode = { op, children: [leaf] };
        expect(fromForm(form)).toEqual({ op: rootOp, children: [leaf,
          negated ? { op: 'not', child: validGroup } : validGroup,
        ] });
      }
    }
  });

  it.each<FilterNode>([
    leaf,
    { op: 'not', child: leaf },
    { op: 'not', child: { op: 'and', children: [leaf] } },
    { op: 'and', children: [{ op: 'not', child: { op: 'not', child: leaf } }] },
    { op: 'and', children: [{ op: 'or', children: [{ op: 'and', children: [leaf] }] }] },
    { op: 'and', children: [{ op: 'or', children: [{ op: 'not', child: { op: 'and', children: [leaf] } }] }] },
    { op: 'or', children: [{ op: 'and', children: [{ op: 'not', child: { op: 'not', child: leaf } }] }] },
  ])('編集できない入れ子を拒否する (%#)', node => {
    expect(toForm(node)).toEqual({ ok: false, error: 'unsupported' });
  });

  it.each(predicates)('$kind の既定値は未完成になる (%#)', pred => {
    const value = defaultPredicate(pred.kind);
    expect(value.kind).toBe(pred.kind);
    expect(rowError(value)).toBeDefined();
    expect(fromForm({ op: 'and', rows: [{ type: 'row', pred: value, negated: false }] })).toEqual({ op: 'and', children: [] });
    if (value.kind === 'monsterType') expect(value.mode).toBe('any');
    if (value.kind === 'textContains') expect(value.includePendulum).toBe(true);
  });

  it.each<[Predicate, string]>([
    [{ kind: 'level', range: { min: 5, max: 4 } }, '最小値は最大値以下'],
    [{ kind: 'atk', range: { max: 100000 } }, '0〜99999の整数'],
    [{ kind: 'def', range: { min: -1 } }, '0〜99999の整数'],
    [{ kind: 'scale', range: { min: 1.5 } }, '0〜99999の整数'],
    [{ kind: 'rank', range: { max: NaN } }, '0〜99999の整数'],
    [{ kind: 'link', range: {} }, 'どちらかを入力'],
    [{ kind: 'nameContains', text: '　 \t' }, 'キーワードを入力'],
    [{ kind: 'textContains', text: 'あ'.repeat(101), includePendulum: true }, '100文字以下'],
    [{ kind: 'attribute', values: [] }, '1つ以上選んで'],
  ])('不正な行を否定の有無にかかわらず除く (%#)', (pred, reason) => {
    expect(rowError(pred)).toContain(reason);
    const form: FilterForm = { op: 'or', rows: [
      { type: 'row', pred, negated: true },
      { type: 'group', op: 'and', negated: true, rows: [
        { type: 'row', pred, negated: false },
        { type: 'row', pred: { kind: 'level', range: { max: 4 } }, negated: false },
      ] },
    ] };
    expect(fromForm(form)).toEqual({ op: 'or', children: [{ op: 'not', child: { op: 'and', children: [leaf] } }] });
    expect(form.rows).toHaveLength(2);
  });
});
