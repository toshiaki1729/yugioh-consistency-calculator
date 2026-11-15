import { useImperativeHandle, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { MAX_TITLE_LENGTH } from '../../domain/limits';
import type { CardData } from '../../domain/types';
import type { ResolvedImport } from '../../importer/resolve';
import { useAppState, useDispatch, useStateNotice } from '../../state/store';
import type { Action } from '../../state/reducer';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { TextField } from '../common/TextField';
import { CustomCardForm } from '../deck/CustomCardForm';
import { ImportChoiceRow, sectionLabels } from './ImportChoiceRow';
import type { ImportChoice } from './ImportChoiceRow';

type ImportAction = Extract<Action, { type: 'import/apply' }>;

/** 未解決カードの扱いと取り込み先を編集し、一括で確定する。 */
export function ImportChoices({ resolved, deckName: initialName, onClose, onImported }: {
  resolved: ResolvedImport; deckName: string; onClose: () => void; onImported: () => void;
}) {
  const { activeDeck } = useAppState();
  const [mode, setMode] = useState<'new' | 'replace'>('new');
  const [deckName, setDeckName] = useState(initialName);
  const [choices, setChoices] = useState<Record<number, ImportChoice>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const { error, isPending, submitImport } = useImportSubmit(onImported);
  const { entries, customCards, totals } = collectImportChoices(resolved, choices);
  const remaining = resolved.unresolved.filter((_, index) => !choices[index]).length;
  const totalLabel = Object.entries(totals).map(([section, count]) =>
    `${sectionLabels[section as keyof typeof sectionLabels]} ${count} 枚`).join(' / ');
  const resolutionLabel = `解決済み ${resolved.entries.length} 件 / 未解決 ${resolved.unresolved.length} 件`
    + `（扱い未選択 ${remaining} 件）`;
  const isSubmitDisabled = remaining > 0 || !deckName.trim()
    || deckName.trim().length > MAX_TITLE_LENGTH || isPending
    || (mode === 'replace' && !activeDeck);
  const editingItem = editing === null ? null : resolved.unresolved[editing];
  function handleReset(index: number) {
    setChoices(previous => {
      const next = { ...previous };
      delete next[index];
      return next;
    });
  }
  function handleCustomSave(card: CardData) {
    if (editing === null) return;
    setChoices({ ...choices, [editing]: { type: 'custom', card } });
    setEditing(null);
  }
  function handleImport() {
    submitImport({
      type: 'import/apply', mode, deckName: deckName.trim(),
      entries, pageData: resolved.pageData, customCards,
    });
  }
  function renderChoice(item: ResolvedImport['unresolved'][number], index: number) {
    return <ImportChoiceRow key={index} item={item} choice={choices[index]}
      onChoose={choice => setChoices({ ...choices, [index]: choice })}
      onReset={() => handleReset(index)} onEdit={() => setEditing(index)} />;
  }
  return <div className="ImportView">
    <Select label="取り込み先" value={mode}
      onChange={event => setMode(event.target.value as 'new' | 'replace')}>
      <option value="new">新しいデッキとして</option>
      <option value="replace" disabled={!activeDeck}>現在のデッキを置き換え</option>
    </Select>
    <TextField label="デッキ名" value={deckName} maxLength={MAX_TITLE_LENGTH} required
      onChange={event => setDeckName(event.target.value)} />
    <p>取り込み枚数: {totalLabel}</p>
    <p>{resolutionLabel}</p>
    {resolved.unresolved.length > 0 && <ul className="ImportView-unresolved">
      {resolved.unresolved.map(renderChoice)}
    </ul>}
    {error && <p role="alert" className="ImportView-error">{error}</p>}
    <div className="ImportView-actions">
      <Button onClick={onClose}>キャンセル</Button>
      <Button variant="primary" disabled={isSubmitDisabled} onClick={handleImport}>取り込みを確定</Button>
    </div>
    {editingItem && <CustomCardForm initialName={editingItem.name} importCount={editingItem.count}
      onClose={() => setEditing(null)} onSave={handleCustomSave} />}
  </div>;
}

function collectImportChoices(resolved: ResolvedImport, choices: Record<number, ImportChoice>) {
  const entries = [...resolved.entries];
  const customCards: NonNullable<ImportAction['customCards']> = [];
  const totals = { main: 0, extra: 0, side: 0 };
  for (const entry of entries) totals[entry.section] += entry.count;
  resolved.unresolved.forEach((item, index) => {
    const choice = choices[index];
    if (!choice || choice.type === 'skip') return;
    totals[item.section] += item.count;
    if (choice.type === 'card') entries.push({
      cardId: choice.card.id, name: choice.card.name, count: item.count, section: item.section,
    });
    else customCards.push({ card: choice.card, count: item.count, section: item.section });
  });
  return { entries, customCards, totals };
}

function useImportSubmit(onImported: () => void) {
  const { app } = useAppState();
  const { lastError } = useStateNotice();
  const dispatch = useDispatch();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const committed = useRef({ app, lastError });
  useImperativeHandle(committed, () => ({ app, lastError }), [app, lastError]);
  function submitImport(action: ImportAction) {
    // reducer の確定結果を同じ操作内で読み、失敗時だけダイアログを残す。
    flushSync(() => {
      setError(null);
      setIsPending(true);
      dispatch({ type: 'error/clear' });
      dispatch(action);
    });
    if (committed.current.app !== app) onImported();
    else if (committed.current.lastError) {
      setError(committed.current.lastError);
      setIsPending(false);
    }
  }
  return { error, isPending, submitImport };
}
