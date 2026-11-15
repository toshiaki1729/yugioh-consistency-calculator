import { useRef, useState } from 'react';
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
  return <Dialog open title={title} onClose={onClose}>
    <form className="DeckHeader-form" onSubmit={event => {
      event.preventDefault();
      if (name.trim()) { onSave(name.trim()); onClose(); }
    }}>
      <TextField label="デッキ名" value={name} maxLength={50} required data-autofocus onChange={event => setName(event.target.value)} />
      <div className="DeckHeader-actions">
        <Button onClick={onClose}>キャンセル</Button>
        <Button type="submit" variant="primary" disabled={!name.trim()}>保存</Button>
      </div>
    </form>
  </Dialog>;
}

export function NewDeckButton() {
  const [open, setOpen] = useState(false);
  const dispatch = useDispatch();
  const { app } = useAppState();
  return <>
    <Button onClick={() => setOpen(true)} disabled={app.decks.length >= 50}>新規デッキ</Button>
    {open && <DeckNameDialog initialName="新しいデッキ" title="新規デッキ" onClose={() => setOpen(false)}
      onSave={name => dispatch({ type: 'deck/create', name })} />}
  </>;
}

export function DeckHeader() {
  const { app, activeDeck } = useAppState();
  const dispatch = useDispatch();
  const status = useSaveStatus();
  const { notice, lastError, saveError } = useStateNotice();
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return <div className="DeckHeader">
    <div className="DeckHeader-toolbar">
      <Select label="デッキ選択" value={activeDeck?.id ?? ''} disabled={app.decks.length === 0}
        onChange={event => dispatch({ type: 'deck/select', deckId: event.target.value })}>
        {!activeDeck && <option value="">デッキがありません</option>}
        {app.decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
      </Select>
      <NewDeckButton />
      <Button disabled={!activeDeck} onClick={() => setDialog('rename')}>名前変更</Button>
      <Button disabled={!activeDeck || app.decks.length >= 50} onClick={() => dispatch({ type: 'deck/duplicate' })}>複製</Button>
      <Button disabled={!activeDeck} variant="danger" onClick={() => setDialog('delete')}>デッキ削除</Button>
      <Button disabled={!activeDeck} onClick={() => { if (activeDeck) downloadDeck(activeDeck); }}>JSON 書き出し</Button>
      <Button disabled={reading || app.decks.length >= 50} onClick={() => fileRef.current?.click()}>JSON 読み込み</Button>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="デッキ JSON ファイル"
        onChange={async event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setReading(true);
          setFileError(null);
          const result = await importDeckFile(file);
          if (result.ok) dispatch({ type: 'deck/import', deck: result.value });
          else setFileError(result.error);
          setReading(false);
        }} />
    </div>
    <p role="status" className={status === 'failed' ? 'DeckHeader-error' : 'DeckHeader-status'}>
      {{ saved: '保存済み', pending: '保存待ち', failed: '保存に失敗しました（JSON で書き出してください）' }[status]}
    </p>
    {saveError && <p className="DeckHeader-error">{saveError}</p>}
    {lastError && <div role="alert" className="DeckHeader-message DeckHeader-error">
      <p>{lastError}</p><Button onClick={() => dispatch({ type: 'error/clear' })}>エラーを閉じる</Button>
    </div>}
    {notice && notice !== dismissedNotice && <div role="status" className="DeckHeader-message">
      <p>{notice}</p><Button onClick={() => setDismissedNotice(notice)}>通知を閉じる</Button>
    </div>}
    {fileError && <div role="alert" className="DeckHeader-message DeckHeader-error">
      <p>{fileError}</p><Button onClick={() => setFileError(null)}>読み込みエラーを閉じる</Button>
    </div>}
    {dialog === 'rename' && activeDeck && <DeckNameDialog initialName={activeDeck.name} title="デッキ名を変更"
      onClose={() => setDialog(null)} onSave={name => dispatch({ type: 'deck/rename', name })} />}
    {dialog === 'delete' && activeDeck && <Dialog open title="デッキを削除" onClose={() => setDialog(null)}>
      <p>「{activeDeck.name}」を削除しますか？ カード・グループ・初動パターンも削除されます。</p>
      <div className="DeckHeader-actions">
        <Button data-autofocus onClick={() => setDialog(null)}>キャンセル</Button>
        <Button variant="danger" onClick={() => { dispatch({ type: 'deck/delete' }); setDialog(null); }}>削除する</Button>
      </div>
    </Dialog>}
  </div>;
}
