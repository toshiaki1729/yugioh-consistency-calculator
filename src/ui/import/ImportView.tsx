import { useState } from 'react';
import type { FormEvent } from 'react';
import { useCardDb } from '../../carddb/useCardDb';
import { validatePayload } from '../../importer/payload';
import type { ImportPayload } from '../../importer/payload';
import { parseDeckText } from '../../importer/text';
import { Button } from '../common/Button';
import { BookmarkletGuide } from './BookmarkletGuide';
import './ImportView.css';

/** ブックマークレットの導入案内とデッキの貼り付け欄を表示する。 */
export function ImportView({ onImport, showDbStatus: shouldShowDbStatus = true }: {
  onImport: (payload: ImportPayload) => void; showDbStatus?: boolean;
}) {
  const state = useCardDb();
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== 'ready') return;
    const parsed = parseDeckText(text, name => state.db.findByExactName(name).length > 0);
    setErrors(parsed.errors);
    if (!parsed.payload) return;
    const checked = validatePayload(parsed.payload);
    if (!checked.ok) { setErrors([{ line: 1, message: checked.error }]); return; }
    onImport(checked.value);
  }
  function renderError(error: typeof errors[number], index: number) {
    return <li key={index}>{error.line} 行目: {error.message}</li>;
  }
  return <div className="ImportView">
    <BookmarkletGuide />
    <form className="ImportView-paste" onSubmit={handleSubmit}>
      <label className="ImportView-field">デッキリストまたはブックマークレットの JSON を貼り付け
        <textarea rows={5} value={text} onChange={event => setText(event.target.value)} />
      </label>
      {errors.length > 0 && <ul role="alert" className="ImportView-error">
        {errors.map(renderError)}
      </ul>}
      {shouldShowDbStatus && state.status === 'loading'
        && <p role="status">カードDBを読み込み中…</p>}
      {shouldShowDbStatus && state.status === 'error' && <div>
        <p role="alert">{state.error}</p><Button onClick={state.retry}>再試行</Button>
      </div>}
      <Button type="submit" disabled={state.status !== 'ready' || !text.trim()}>取り込む</Button>
    </form>
  </div>;
}
