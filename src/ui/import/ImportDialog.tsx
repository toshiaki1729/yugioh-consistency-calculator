import { useEffect, useMemo, useState } from 'react';
import { useCardDb } from '../../carddb/useCardDb';
import type { AppState, CardData } from '../../domain/types';
import type { ImportPayload } from '../../importer/payload';
import { resolveImport } from '../../importer/resolve';
import type { ResolvedImport } from '../../importer/resolve';
import { useAppState, useDispatch, useStateNotice } from '../../state/store';
import type { Action } from '../../state/reducer';
import { Button } from '../common/Button';
import { Dialog } from '../common/Dialog';
import { Select } from '../common/Select';
import { TextField } from '../common/TextField';
import { CardSearch } from '../deck/CardSearch';
import { CustomCardForm } from '../deck/CustomCardForm';
import './ImportView.css';

type Choice = { type: 'card' | 'custom'; card: CardData } | { type: 'skip' };
const sections = { main: 'メイン', extra: 'エクストラ', side: 'サイド' } as const;

export function ImportDialog({ payload, onClose, onImported }: {
  payload: ImportPayload; onClose: () => void; onImported: () => void;
}) {
  const state = useCardDb();
  const db = state.status === 'ready' ? state.db : undefined;
  const resolved = useMemo(() => db ? resolveImport(payload, db) : null, [payload, db]);
  return <Dialog open title="デッキを取り込む" onClose={onClose}>
    {state.status === 'loading' && <p role="status">カードデータを読み込み中</p>}
    {state.status === 'error' && <div><p role="alert">{state.error}</p><Button onClick={state.retry}>再試行</Button></div>}
    {resolved && <ImportChoices resolved={resolved} deckName={payload.deckName ?? '取り込んだデッキ'} onClose={onClose} onImported={onImported} />}
  </Dialog>;
}

function ImportChoices({ resolved, deckName: initialName, onClose, onImported }: {
  resolved: ResolvedImport; deckName: string; onClose: () => void; onImported: () => void;
}) {
  const { app, activeDeck } = useAppState();
  const dispatch = useDispatch();
  const { lastError } = useStateNotice();
  const [mode, setMode] = useState<'new' | 'replace'>('new');
  const [deckName, setDeckName] = useState(initialName);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, setPending] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending) return;
    if (app !== pending) onImported();
    else if (lastError) { setError(lastError); setPending(null); }
  }, [app, pending, lastError, onImported]);

  const entries = [...resolved.entries];
  const customCards: NonNullable<Extract<Action, { type: 'import/apply' }>['customCards']> = [];
  const totals = { main: 0, extra: 0, side: 0 };
  for (const entry of entries) totals[entry.section] += entry.count;
  resolved.unresolved.forEach((item, index) => {
    const choice = choices[index];
    if (!choice || choice.type === 'skip') return;
    totals[item.section] += item.count;
    if (choice.type === 'card') entries.push({ cardId: choice.card.id, name: choice.card.name, count: item.count, section: item.section });
    else customCards.push({ card: choice.card, count: item.count, section: item.section });
  });
  const remaining = resolved.unresolved.filter((_, index) => !choices[index]).length;

  return <div className="ImportView">
    <Select label="取り込み先" value={mode} onChange={event => setMode(event.target.value as 'new' | 'replace')}>
      <option value="new">新しいデッキとして</option>
      <option value="replace" disabled={!activeDeck}>現在のデッキを置き換え</option>
    </Select>
    <TextField label="デッキ名" value={deckName} maxLength={50} required onChange={event => setDeckName(event.target.value)} />
    <p>取り込み枚数: {Object.entries(totals).map(([section, count]) => `${sections[section as keyof typeof sections]} ${count} 枚`).join(' / ')}</p>
    <p>解決済み {resolved.entries.length} 件 / 未解決 {resolved.unresolved.length} 件（扱い未選択 {remaining} 件）</p>
    {resolved.unresolved.length > 0 && <ul className="ImportView-unresolved">
      {resolved.unresolved.map((item, index) => {
        const choice = choices[index];
        return <li key={index} aria-label={`${item.name}の解決`}>
          <p><strong>{item.name}</strong> — {sections[item.section]} {item.count} 枚</p>
          {choice ? <div className="ImportView-actions">
            <p>{choice.type === 'skip' ? '取り込まない' : `${choice.type === 'custom' ? 'カスタムカード: ' : '選択: '}${choice.card.name}`}</p>
            <Button onClick={() => setChoices(previous => {
              const next = { ...previous }; delete next[index]; return next;
            })}>選び直す</Button>
          </div> : <>
            {item.candidates.length > 0 && <div className="ImportView-actions" role="group" aria-label="候補">
              {item.candidates.map(card => <Button key={card.id} onClick={() => setChoices({ ...choices, [index]: { type: 'card', card } })}>{card.name}</Button>)}
            </div>}
            <CardSearch onAdd={card => setChoices({ ...choices, [index]: { type: 'card', card } })} />
            <div className="ImportView-actions">
              <Button onClick={() => setEditing(index)}>カスタムカードとして作る</Button>
              <Button onClick={() => setChoices({ ...choices, [index]: { type: 'skip' } })}>取り込まない</Button>
            </div>
          </>}
        </li>;
      })}
    </ul>}
    {error && <p role="alert" className="ImportView-error">{error}</p>}
    <div className="ImportView-actions">
      <Button onClick={onClose}>キャンセル</Button>
      <Button variant="primary" disabled={remaining > 0 || !deckName.trim() || deckName.trim().length > 50 || !!pending || (mode === 'replace' && !activeDeck)}
        onClick={() => {
          setError(null);
          setPending(app);
          dispatch({ type: 'error/clear' });
          dispatch({ type: 'import/apply', mode, deckName: deckName.trim(), entries, pageData: resolved.pageData, customCards });
        }}>取り込みを確定</Button>
    </div>
    {editing !== null && <CustomCardForm initialName={resolved.unresolved[editing].name} importCount={resolved.unresolved[editing].count}
      onClose={() => setEditing(null)} onSave={card => {
        setChoices({ ...choices, [editing]: { type: 'custom', card } });
        setEditing(null);
      }} />}
  </div>;
}
