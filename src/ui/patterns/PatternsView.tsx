import { useState } from 'react';
import { useResolveCard } from '../../carddb/useCardDb';
import { isInGroup } from '../../domain/filter';
import type { Deck, Pattern, SlotSource } from '../../domain/types';
import { useDispatch } from '../../state/store';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import { Dialog } from '../common/Dialog';
import { EmptyState } from '../common/EmptyState';
import { IconButton } from '../common/IconButton';
import { Select } from '../common/Select';
import { TextField } from '../common/TextField';
import { useCalculation } from './CalculationProvider';
import { EstimateValue } from './EstimateValue';
import './PatternsView.css';

function PatternEditor({ deck, pattern }: { deck: Deck; pattern: Pattern }) {
  const dispatch = useDispatch();
  const resolveCard = useResolveCard();
  const [name, setName] = useState(pattern.name);
  const cards = deck.entries.filter(entry => entry.section === 'main')
    .map(entry => { const card = resolveCard(entry.cardId); return { ...entry, card, name: card?.name ?? entry.name }; })
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const sources: { value: string; name: string; source: SlotSource }[] = [
    ...deck.groups.map(group => ({ value: `group:${group.id}`, name: group.name, source: { type: 'group' as const, groupId: group.id } })),
    ...cards.map(card => ({ value: `card:${card.cardId}`, name: card.name, source: { type: 'card' as const, cardId: card.cardId } })),
  ];
  return <section className="PatternsView-editor" aria-label="パターンの編集">
    <TextField label="パターン名" value={name} required maxLength={50} aria-invalid={!name.trim()}
      onChange={event => setName(event.target.value)} onBlur={() => {
        if (!name.trim()) { setName(pattern.name); return; }
        if (name !== pattern.name) dispatch({ type: 'pattern/edit', patternId: pattern.id, changes: { name } });
      }} />
    {deck.groups.length === 0 && <p className="PatternsView-note">条件でカードをまとめるには、カードグループを先に作成してください。特定のカードはそのまま指定できます。</p>}
    {pattern.slots.map((slot, index) => {
      const source = slot.source;
      const value = source.type === 'group' ? `group:${source.groupId}` : `card:${source.cardId}`;
      const group = source.type === 'group' ? deck.groups.find(item => item.id === source.groupId) : undefined;
      const emptyGroup = group && !cards.some(card => isInGroup(group, card.cardId, card.card));
      return <fieldset className="PatternsView-slot" key={slot.id}>
        <legend>スロット {index + 1}</legend>
        <Select label="対象" value={value} onChange={event => {
          const selected = sources.find(item => item.value === event.target.value)!;
          dispatch({ type: 'slot/edit', patternId: pattern.id, slotId: slot.id, changes: { source: selected.source } });
        }}>
          {!sources.some(item => item.value === value) && <option value={value} disabled>メインデッキにないカード</option>}
          <optgroup label="グループ">{sources.filter(item => item.source.type === 'group').map(item =>
            <option key={item.value} value={item.value}>グループ: {item.name}</option>)}</optgroup>
          <optgroup label="カード">{sources.filter(item => item.source.type === 'card').map(item =>
            <option key={item.value} value={item.value}>カード: {item.name}</option>)}</optgroup>
        </Select>
        <div className="PatternsView-actions">
          <Select label="必要枚数" value={slot.count} onChange={event => {
            const count = Number(event.target.value);
            dispatch({ type: 'slot/edit', patternId: pattern.id, slotId: slot.id,
              changes: { count, distinctNames: count === 1 ? false : slot.distinctNames } });
          }}>{[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count}</option>)}</Select>
          <Checkbox label="種類違い" checked={slot.distinctNames} disabled={slot.count < 2}
            aria-describedby="distinct-description" onChange={event => dispatch({ type: 'slot/edit', patternId: pattern.id,
              slotId: slot.id, changes: { distinctNames: event.target.checked } })} />
          <Button variant="danger" onClick={() => dispatch({ type: 'slot/delete', patternId: pattern.id, slotId: slot.id })}>スロットを削除</Button>
        </div>
        {emptyGroup && <p className="PatternsView-warning">このグループに該当するカードがメインデッキにありません</p>}
      </fieldset>;
    })}
    {pattern.slots.length > 0 && <p id="distinct-description" className="PatternsView-note">種類違い: 別々のカード（カードDB上の別カード）を必要枚数そろえる</p>}
    {sources.length === 0 && <p className="PatternsView-note">メインデッキにカードを追加して、スロットの対象を選んでください。</p>}
    <Button disabled={pattern.slots.length >= 8 || sources.length === 0} onClick={() => dispatch({ type: 'slot/add',
      patternId: pattern.id, slot: { source: sources[0].source, count: 1, distinctNames: false } })}>スロットを追加</Button>
  </section>;
}

export function PatternsView({ deck }: { deck: Deck }) {
  const dispatch = useDispatch();
  const resolveCard = useResolveCard();
  const calculation = useCalculation();
  const first = calculation.results?.find(result => result.handSize === 5);
  const [selectedId, setSelectedId] = useState<string | null>(deck.patterns[0]?.id ?? null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const selected = deck.patterns.find(pattern => pattern.id === selectedId) ?? deck.patterns.at(-1);
  const deleting = deck.patterns.find(pattern => pattern.id === deletingId);

  function move(index: number, offset: number) {
    const ids = deck.patterns.map(pattern => pattern.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    dispatch({ type: 'pattern/reorder', patternIds: ids });
  }

  return <div className="PatternsView">
    {deck.patterns.length === 0 && <EmptyState>初動とみなすカードの組み合わせをパターンとして作成してください。</EmptyState>}
    <Button disabled={deck.patterns.length >= 200} onClick={() => {
      let number = 1;
      while (deck.patterns.some(pattern => pattern.name === `パターン ${number}`)) number++;
      dispatch({ type: 'pattern/create', name: `パターン ${number}` });
      setSelectedId(null);
    }}>パターンを作成</Button>
    {calculation.stale && <p className="PatternsView-warning">古い結果（再計算してください）</p>}
    <ul className="PatternsView-list" aria-label="パターン一覧">{deck.patterns.map((pattern, index) => {
      const summary = pattern.slots.map(slot => {
        const source = slot.source;
        const name = source.type === 'group' ? deck.groups.find(group => group.id === source.groupId)?.name
          : resolveCard(source.cardId)?.name ?? deck.entries.find(entry => entry.cardId === source.cardId)?.name ?? '未取得カード';
        return `${name} ×${slot.count}${slot.distinctNames ? '（種類違い）' : ''}`;
      }).join(' + ') || 'スロットがありません';
      return <li key={pattern.id} aria-label={pattern.name} className="PatternsView-row">
        <Checkbox label="有効" aria-label={`${pattern.name}を有効にする`} checked={pattern.enabled}
          onChange={() => dispatch({ type: 'pattern/toggle', patternId: pattern.id })} />
        <button type="button" className="PatternsView-choice" aria-pressed={selected?.id === pattern.id} onClick={() => setSelectedId(pattern.id)}>
          <span>{pattern.name}</span><span className="PatternsView-note">{summary}</span>
        </button>
        <span>{!pattern.enabled ? '無効' : first?.perPattern[pattern.id]
          ? <EstimateValue estimate={first.perPattern[pattern.id]} /> : '未計算'}</span>
        <div className="PatternsView-actions">
          <IconButton aria-label={`${pattern.name}を上へ`} disabled={index === 0} onClick={() => move(index, -1)}>↑</IconButton>
          <IconButton aria-label={`${pattern.name}を下へ`} disabled={index === deck.patterns.length - 1} onClick={() => move(index, 1)}>↓</IconButton>
          <Button disabled={deck.patterns.length >= 200} onClick={() => {
            dispatch({ type: 'pattern/duplicate', patternId: pattern.id }); setSelectedId(null);
          }}>複製</Button>
          <Button variant="danger" onClick={() => setDeletingId(pattern.id)}>削除</Button>
        </div>
      </li>;
    })}</ul>
    {selected && <PatternEditor key={selected.id} deck={deck} pattern={selected} />}
    {deleting && <Dialog open title="パターンを削除" onClose={() => setDeletingId(null)}>
      <p>「{deleting.name}」を削除しますか？</p>
      <div className="PatternsView-actions">
        <Button onClick={() => setDeletingId(null)}>キャンセル</Button>
        <Button variant="danger" onClick={() => { dispatch({ type: 'pattern/delete', patternId: deleting.id }); setDeletingId(null); }}>削除する</Button>
      </div>
    </Dialog>}
  </div>;
}
