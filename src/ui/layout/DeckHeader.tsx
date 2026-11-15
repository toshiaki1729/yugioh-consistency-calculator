import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { MAX_DECKS, MAX_TITLE_LENGTH } from '../../domain/limits';
import { useAppState, useDispatch, useSaveStatus, useStateNotice } from '../../state/store';
import { downloadDeck, importDeckFile } from '../../state/persist';
import { Button } from '../common/Button';
import { Dialog } from '../common/Dialog';
import { TextField } from '../common/TextField';
import { Select } from '../common/Select';
import './DeckHeader.css';

function DeckNameDialog({ initialName, title, onClose, onSave }: {
  initialName: string; title: string; onClose: () => void; onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim()) { onSave(name.trim()); onClose(); }
  }
  return <Dialog open title={title} onClose={onClose}>
    <form className="DeckHeader-form" onSubmit={handleSubmit}>
      <TextField label="デッキ名" value={name} maxLength={MAX_TITLE_LENGTH} required data-autofocus
        onChange={event => setName(event.target.value)} />
      <div className="DeckHeader-actions">
        <Button onClick={onClose}>キャンセル</Button>
        <Button type="submit" variant="primary" disabled={!name.trim()}>保存</Button>
      </div>
    </form>
  </Dialog>;
}

/** デッキ名を入力して新しいデッキを作成する。 */
export function NewDeckButton() {
  const [isOpen, setIsOpen] = useState(false);
  const dispatch = useDispatch();
  const { app } = useAppState();
  return <>
    <Button onClick={() => setIsOpen(true)} disabled={app.decks.length >= MAX_DECKS}>新規デッキ</Button>
    {isOpen && <DeckNameDialog initialName="新しいデッキ" title="新規デッキ"
      onClose={() => setIsOpen(false)} onSave={name => dispatch({ type: 'deck/create', name })} />}
  </>;
}

/** デッキの管理操作と保存・読み込みの状態を表示する。 */
export function DeckHeader() {
  const { activeDeck } = useAppState();
  const dispatch = useDispatch();
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  function handleDelete() {
    dispatch({ type: 'deck/delete' });
    setDialog(null);
  }
  return <div className="DeckHeader">
    <DeckToolbar onDialog={setDialog} onFileError={setFileError} />
    <DeckNotices />
    {fileError && <div role="alert" className="DeckHeader-message DeckHeader-error">
      <p>{fileError}</p><Button onClick={() => setFileError(null)}>読み込みエラーを閉じる</Button>
    </div>}
    {dialog === 'rename' && activeDeck && <DeckNameDialog initialName={activeDeck.name}
      title="デッキ名を変更" onClose={() => setDialog(null)}
      onSave={name => dispatch({ type: 'deck/rename', name })} />}
    {dialog === 'delete' && activeDeck && <Dialog open title="デッキを削除"
      onClose={() => setDialog(null)}>
      <p>「{activeDeck.name}」を削除しますか？ カード・グループ・初動パターンも削除されます。</p>
      <div className="DeckHeader-actions">
        <Button data-autofocus onClick={() => setDialog(null)}>キャンセル</Button>
        <Button variant="danger" onClick={handleDelete}>削除する</Button>
      </div>
    </Dialog>}
  </div>;
}

function DeckToolbar({ onDialog, onFileError }: {
  onDialog: (dialog: 'rename' | 'delete') => void;
  onFileError: (error: string | null) => void;
}) {
  const { app, activeDeck } = useAppState();
  const dispatch = useDispatch();
  const [isReading, setIsReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasMaxDecks = app.decks.length >= MAX_DECKS;
  function handleExport() {
    if (activeDeck) downloadDeck(activeDeck);
  }
  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsReading(true);
    onFileError(null);
    const result = await importDeckFile(file);
    if (result.ok) dispatch({ type: 'deck/import', deck: result.value });
    else onFileError(result.error);
    setIsReading(false);
  }
  return <div className="DeckHeader-toolbar">
    <Select label="デッキ選択" value={activeDeck?.id ?? ''} disabled={app.decks.length === 0}
      onChange={event => dispatch({ type: 'deck/select', deckId: event.target.value })}>
      {!activeDeck && <option value="">デッキがありません</option>}
      {app.decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
    </Select>
    <NewDeckButton />
    <Button disabled={!activeDeck} onClick={() => onDialog('rename')}>名前変更</Button>
    <Button disabled={!activeDeck || hasMaxDecks}
      onClick={() => dispatch({ type: 'deck/duplicate' })}>複製</Button>
    <Button disabled={!activeDeck} variant="danger"
      onClick={() => onDialog('delete')}>デッキ削除</Button>
    <Button disabled={!activeDeck} onClick={handleExport}>JSON 書き出し</Button>
    <Button disabled={isReading || hasMaxDecks}
      onClick={() => fileRef.current?.click()}>JSON 読み込み</Button>
    <input ref={fileRef} type="file" accept=".json,application/json" hidden
      aria-label="デッキ JSON ファイル" onChange={handleFileChange} />
  </div>;
}

function DeckNotices() {
  const dispatch = useDispatch();
  const status = useSaveStatus();
  const { notice, lastError, saveError } = useStateNotice();
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);
  const statusLabels = {
    saved: '保存済み', pending: '保存待ち', failed: '保存に失敗しました（JSON で書き出してください）',
  };
  return <>
    <p role="status" className={status === 'failed' ? 'DeckHeader-error' : 'DeckHeader-status'}>
      {statusLabels[status]}
    </p>
    {saveError && <p className="DeckHeader-error">{saveError}</p>}
    {lastError && <div role="alert" className="DeckHeader-message DeckHeader-error">
      <p>{lastError}</p><Button onClick={() => dispatch({ type: 'error/clear' })}>エラーを閉じる</Button>
    </div>}
    {notice && notice !== dismissedNotice && <div role="status" className="DeckHeader-message">
      <p>{notice}</p><Button onClick={() => setDismissedNotice(notice)}>通知を閉じる</Button>
    </div>}
  </>;
}
