import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FilterNode } from '../src/domain/types';
import { attributeLabels, monsterTypeLabels, races } from '../src/domain/labels';
import { validateFilter } from '../src/domain/validate';
import { FilterBuilder } from '../src/ui/groups/FilterBuilder';
import type { FilterBuilderProps } from '../src/ui/groups/FilterBuilder';

const empty: FilterNode = { op: 'and', children: [] };
const level: FilterNode = { op: 'pred', pred: { kind: 'level', range: { max: 4 } } };

async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 160)); });
}

function setup(value: FilterNode = empty, deckCards: FilterBuilderProps['deckCards'] = []) {
  const onChange = vi.fn();
  function Controlled() {
    const [node, setNode] = useState(value);
    return <FilterBuilder value={node} deckCards={deckCards} onChange={next => {
      onChange(next);
      setNode(JSON.parse(JSON.stringify(next)) as FilterNode);
    }} />;
  }
  render(<StrictMode><Controlled /></StrictMode>);
  return { user: userEvent.setup(), onChange };
}

afterEach(() => vi.useRealTimers());

describe('条件ビルダー', () => {
  it('レベル4以下・攻撃力1500以下のモンスターを作る', async () => {
    const { user, onChange } = setup();
    await user.click(screen.getByRole('button', { name: '条件を追加' }));
    let row = within(screen.getByRole('group', { name: '条件 1' }));
    await user.selectOptions(row.getByLabelText('条件の種類'), 'cardKind');
    await user.click(row.getByLabelText('モンスター'));
    await user.click(screen.getByRole('button', { name: '条件を追加' }));
    row = within(screen.getByRole('group', { name: '条件 2' }));
    await user.selectOptions(row.getByLabelText('条件の種類'), 'level');
    await user.type(row.getByLabelText('以下'), '4');
    await settle();
    await user.click(screen.getByRole('button', { name: '条件を追加' }));
    row = within(screen.getByRole('group', { name: '条件 3' }));
    await user.selectOptions(row.getByLabelText('条件の種類'), 'atk');
    await user.type(row.getByLabelText('以下'), '1500');
    await settle();
    expect(onChange).toHaveBeenLastCalledWith({ op: 'and', children: [
      { op: 'pred', pred: { kind: 'cardKind', values: ['monster'] } }, level,
      { op: 'pred', pred: { kind: 'atk', range: { max: 1500 } } },
    ] });
  });

  it.each(['and', 'or'] as const)('%sまとまりの否定で行の否定を解除・無効化し、深さ4以内に保つ', async op => {
    const { user, onChange } = setup();
    await user.click(screen.getByRole('button', { name: '条件のまとまりを追加' }));
    const group = within(screen.getByRole('group', { name: '条件のまとまり 1' }));
    await user.selectOptions(group.getByLabelText('まとまりの一致'), op);
    await user.click(group.getByRole('button', { name: '条件を追加' }));
    await user.type(group.getByLabelText('キーワード'), '青眼');
    await settle();
    await user.click(group.getByLabelText('〜でない'));
    expect(group.getByLabelText('〜でない')).toBeChecked();
    await user.click(group.getByLabelText('まとまりを否定'));
    expect(group.getByLabelText('〜でない')).not.toBeChecked();
    expect(group.getByLabelText('〜でない')).toBeDisabled();
    expect(group.getByText('否定したまとまりの中の行は否定できません')).toBeVisible();
    await user.click(group.getByLabelText('〜でない'));
    expect(onChange).toHaveBeenLastCalledWith({ op: 'and', children: [{ op: 'not', child: {
      op, children: [{ op: 'pred', pred: { kind: 'nameContains', text: '青眼' } }],
    } }] });
    await user.click(group.getByRole('button', { name: '条件を追加' }));
    expect(group.getAllByLabelText('〜でない')).toHaveLength(2);
    for (const checkbox of group.getAllByLabelText('〜でない')) {
      expect(checkbox).toBeDisabled();
      expect(checkbox).not.toBeChecked();
    }
    await user.click(within(group.getByRole('group', { name: '条件 1.2' })).getByRole('button', { name: '条件を削除' }));
    await user.click(group.getByLabelText('まとまりを否定'));
    expect(group.getByLabelText('〜でない')).toBeEnabled();
    expect(group.getByLabelText('〜でない')).not.toBeChecked();
    expect(group.queryByText('否定したまとまりの中の行は否定できません')).not.toBeInTheDocument();
    await user.click(group.getByLabelText('〜でない'));
    expect(onChange).toHaveBeenLastCalledWith({ op: 'and', children: [{ op, children: [
      { op: 'not', child: { op: 'pred', pred: { kind: 'nameContains', text: '青眼' } } },
    ] }] });
    await user.click(group.getByRole('button', { name: '条件を削除' }));
    expect(group.queryByLabelText('キーワード')).not.toBeInTheDocument();
    await user.click(group.getByRole('button', { name: 'まとまりを削除' }));
    expect(onChange).toHaveBeenLastCalledWith(empty);
    for (const [node] of onChange.mock.calls) expect(validateFilter(node).ok).toBe(true);
  });

  it.each(['and', 'or'] as const)('最上位ORで空・不正行だけの%sまとまりを無視し、有効な行の入力後に反映する', async op => {
    const initial: FilterNode = { op: 'or', children: [level] };
    const { user, onChange } = setup(initial);
    await user.click(screen.getByRole('button', { name: '条件のまとまりを追加' }));
    const group = within(screen.getByRole('group', { name: '条件のまとまり 2' }));
    await user.selectOptions(group.getByLabelText('まとまりの一致'), op);
    expect(group.getByText('条件がないため無視しています')).toBeVisible();
    expect(onChange).toHaveBeenLastCalledWith(initial);
    await user.click(group.getByLabelText('まとまりを否定'));
    expect(onChange).toHaveBeenLastCalledWith(initial);
    await user.click(group.getByRole('button', { name: '条件を追加' }));
    expect(group.getByText('条件がないため無視しています')).toBeVisible();
    expect(onChange).toHaveBeenLastCalledWith(initial);
    await user.selectOptions(group.getByLabelText('条件の種類'), 'level');
    await user.type(group.getByLabelText('以上'), '5');
    await user.type(group.getByLabelText('以下'), '4');
    await settle();
    expect(group.getByText('条件がないため無視しています')).toBeVisible();
    expect(onChange).toHaveBeenLastCalledWith(initial);
    await user.clear(group.getByLabelText('以上'));
    await settle();
    expect(group.queryByText('条件がないため無視しています')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({ op: 'or', children: [level, { op: 'not', child: { op, children: [level] } }] });
    await user.clear(group.getByLabelText('以下'));
    await settle();
    expect(group.getByText('条件がないため無視しています')).toBeVisible();
    expect(onChange).toHaveBeenLastCalledWith(initial);
    expect(group.getByLabelText('以下')).toHaveValue('');
  });

  it.each(['and', 'or'] as const)('否定した%sまとまり内に否定行がある入力は編集できない', op => {
    const onChange = vi.fn();
    const node: FilterNode = { op: 'and', children: [{ op: 'not', child: {
      op, children: [{ op: 'not', child: level }],
    } }] };
    render(<FilterBuilder value={node} onChange={onChange} deckCards={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('この条件は画面では編集できません');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('入力から150ms後に通知し、親が値を返しても未完成行を残す', async () => {
    vi.useFakeTimers();
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: '条件を追加' }));
    expect(screen.getByRole('status')).toHaveTextContent('キーワードを入力してください（この行は条件から除外しています）');
    onChange.mockClear();
    fireEvent.change(screen.getByLabelText('キーワード'), { target: { value: '青' } });
    await act(() => vi.advanceTimersByTime(100));
    fireEvent.change(screen.getByLabelText('キーワード'), { target: { value: '青眼' } });
    await act(() => vi.advanceTimersByTime(149));
    expect(onChange).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ op: 'and', children: [{ op: 'pred', pred: { kind: 'nameContains', text: '青眼' } }] });
    fireEvent.change(screen.getByLabelText('キーワード'), { target: { value: '' } });
    await act(() => vi.advanceTimersByTime(150));
    expect(onChange).toHaveBeenLastCalledWith(empty);
    expect(screen.getByLabelText('キーワード')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('条件全体の一致'), { target: { value: 'or' } });
    expect(screen.getByLabelText('キーワード')).toBeVisible();
    expect(onChange).toHaveBeenLastCalledWith({ op: 'or', children: [] });
  });

  it('範囲の逆転・上限超過・未入力を除外し、片側だけの値と0を扱う', async () => {
    const { user, onChange } = setup({ op: 'and', children: [level] });
    await user.type(screen.getByLabelText('以上'), '5');
    expect(screen.getByRole('status')).toHaveTextContent('最小値は最大値以下にしてください');
    await settle();
    expect(onChange).toHaveBeenLastCalledWith(empty);
    expect(screen.getByLabelText('以上')).toHaveValue('5');
    await user.clear(screen.getByLabelText('以下'));
    await settle();
    expect(onChange).toHaveBeenLastCalledWith({ op: 'and', children: [{ op: 'pred', pred: { kind: 'level', range: { min: 5 } } }] });
    await user.clear(screen.getByLabelText('以上'));
    expect(screen.getByRole('status')).toHaveTextContent('どちらかを入力');
    await user.type(screen.getByLabelText('以下'), '100000');
    expect(screen.getByRole('status')).toHaveTextContent('0〜99999 の整数');
    await settle();
    expect(onChange).toHaveBeenLastCalledWith(empty);
    await user.clear(screen.getByLabelText('以下'));
    await user.type(screen.getByLabelText('以下'), '0');
    await settle();
    expect(onChange).toHaveBeenLastCalledWith({ op: 'and', children: [{ op: 'pred', pred: { kind: 'level', range: { max: 0 } } }] });
  });

  it('種類変更で値を初期化し、全種族・属性・モンスター種類を選べる', async () => {
    const { user, onChange } = setup({ op: 'and', children: [level] });
    await user.selectOptions(screen.getByLabelText('条件の種類'), 'race');
    expect(screen.getByRole('status')).toHaveTextContent('1 つ以上選んでください');
    expect(screen.getAllByRole('checkbox')).toHaveLength(27);
    for (const race of races) expect(screen.getByLabelText(race)).not.toBeChecked();
    await user.click(screen.getByLabelText('ドラゴン族'));
    expect(onChange).toHaveBeenLastCalledWith({ op: 'and', children: [{ op: 'pred', pred: { kind: 'race', values: ['ドラゴン族'] } }] });
    await user.selectOptions(screen.getByLabelText('条件の種類'), 'attribute');
    for (const label of Object.values(attributeLabels)) expect(screen.getByLabelText(label)).not.toBeChecked();
    await user.click(screen.getByLabelText('光'));
    await user.click(screen.getByLabelText('光'));
    expect(onChange).toHaveBeenLastCalledWith(empty);
    await user.selectOptions(screen.getByLabelText('条件の種類'), 'monsterType');
    for (const label of Object.values(monsterTypeLabels)) expect(screen.getByLabelText(label)).not.toBeChecked();
    expect(screen.getByLabelText('モンスターの種類の一致')).toHaveValue('any');
    await user.click(screen.getByLabelText('効果'));
    await user.click(screen.getByLabelText('チューナー'));
    await user.selectOptions(screen.getByLabelText('モンスターの種類の一致'), 'all');
    expect(onChange).toHaveBeenLastCalledWith({ op: 'and', children: [{ op: 'pred', pred: { kind: 'monsterType', values: ['effect', 'tuner'], mode: 'all' } }] });
  });

  it('ペンデュラム効果の切替と近似条件の案内を表示する', async () => {
    const { user, onChange } = setup({ op: 'and', children: [level] });
    await user.selectOptions(screen.getByLabelText('条件の種類'), 'textContains');
    expect(screen.getByLabelText('ペンデュラム効果を含む')).toBeChecked();
    await user.type(screen.getByLabelText('キーワード'), '召喚');
    await settle();
    await user.click(screen.getByLabelText('ペンデュラム効果を含む'));
    expect(onChange).toHaveBeenLastCalledWith({ op: 'and', children: [{ op: 'pred', pred: { kind: 'textContains', text: '召喚', includePendulum: false } }] });
    await user.selectOptions(screen.getByLabelText('条件の種類'), 'archetype');
    expect(screen.getByLabelText('キーワード')).toHaveValue('');
    expect(screen.getByText(/テーマ判定はカード名・読み/)).toHaveTextContent('手動で追加・除外');
    await user.selectOptions(screen.getByLabelText('条件の種類'), 'mentionsName');
    expect(screen.getByText(/『X』の記述による近似/)).toHaveTextContent('手動で追加・除外');
  });

  it('カード選択肢を名前順にし、未取得カードも選択できる', async () => {
    const cards = [{ id: 'k2', name: 'い' }, { id: 'k1', name: 'あ' }];
    const { user, onChange } = setup({ op: 'and', children: [level] }, cards);
    await user.selectOptions(screen.getByLabelText('条件の種類'), 'cards');
    expect(screen.getAllByRole('checkbox').slice(0, 2).map(input => input.closest('label')?.textContent)).toEqual(['あ', 'い']);
    await user.click(screen.getByLabelText('あ'));
    expect(onChange).toHaveBeenLastCalledWith({ op: 'and', children: [{ op: 'pred', pred: { kind: 'cards', cardIds: ['k1'] } }] });
    expect(cards.map(card => card.id)).toEqual(['k2', 'k1']);
  });

  it('外部の値変更でフォームを置換し、前の入力の通知を取り消す', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const props = { onChange, deckCards: [] };
    const { rerender, unmount } = render(<FilterBuilder {...props} value={{ op: 'and', children: [level] }} />);
    fireEvent.change(screen.getByLabelText('以下'), { target: { value: '3' } });
    rerender(<FilterBuilder {...props} value={{ op: 'or', children: [{ op: 'pred', pred: { kind: 'nameContains', text: '別の条件' } }] }} />);
    expect(screen.getByLabelText('キーワード')).toHaveValue('別の条件');
    await act(() => vi.advanceTimersByTime(150));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('キーワード'), { target: { value: '更新' } });
    unmount();
    await act(() => vi.advanceTimersByTime(150));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('親の検証でプロパティ順が変わっても未完成行を保持する', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const props = { onChange, deckCards: [] };
    const { rerender } = render(<FilterBuilder {...props} value={{ op: 'and', children: [level] }} />);
    fireEvent.click(screen.getByRole('button', { name: '条件を追加' }));
    fireEvent.change(screen.getByLabelText('以上'), { target: { value: '2' } });
    await act(() => vi.advanceTimersByTime(150));
    const emitted = onChange.mock.calls.at(-1)![0] as FilterNode;
    const checked = validateFilter(emitted);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(JSON.stringify(checked.value)).not.toBe(JSON.stringify(emitted));
    rerender(<FilterBuilder {...props} value={checked.value} />);
    expect(screen.getByLabelText('キーワード')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('キーワードを入力してください');
    expect(screen.getByLabelText('以上')).toHaveValue('2');
  });

  it('未対応の条件は変更せず編集操作を出さない', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { rerender } = render(<FilterBuilder value={level} onChange={onChange} deckCards={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('この条件は画面では編集できません');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    rerender(<FilterBuilder value={{ op: 'and', children: [level] }} onChange={onChange} deckCards={[]} />);
    fireEvent.change(screen.getByLabelText('以下'), { target: { value: '2' } });
    rerender(<FilterBuilder value={level} onChange={onChange} deckCards={[]} />);
    await act(() => vi.advanceTimersByTime(150));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
