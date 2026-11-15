import { useState } from 'react';
import { useCardDb } from '../../carddb/useCardDb';
import { buildBookmarkletUrl } from '../../importer/bookmarklet';
import { validatePayload } from '../../importer/payload';
import type { ImportPayload } from '../../importer/payload';
import { parseDeckText } from '../../importer/text';
import { Button } from '../common/Button';
import './ImportView.css';

export function ImportView({ onImport, showDbStatus = true }: { onImport: (payload: ImportPayload) => void; showDbStatus?: boolean }) {
  const state = useCardDb();
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const [message, setMessage] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [bookmarklet] = useState(() => buildBookmarkletUrl(location.origin + location.pathname));

  return <div className="ImportView">
    <details>
      <summary>公式カードデータベースから取り込む</summary>
      <div className="ImportView-guide">
        <p>PC: 下のリンクをブックマークバーへドラッグ → 公式カードデータベース（遊戯王ニューロン）で自分のデッキの詳細ページを開く → ブックマークを実行</p>
        <p>スマートフォン: 下のボタンでコードをコピー → 任意のページをブックマークし、そのブックマークの URL をコピーしたコードに書き換える → デッキの詳細ページを開いた状態でアドレスバーにブックマーク名を入力して選ぶ</p>
        <div className="ImportView-actions">
          <a ref={element => element?.setAttribute('href', bookmarklet)} draggable onClick={event => {
            event.preventDefault();
            setMessage('ブックマークに登録してから、公式カードデータベースのデッキ詳細ページで使います');
          }}>初動率計算機に取り込む</a>
          <Button onClick={() => {
            setShowCode(false);
            // Clipboard API の未提供・同期例外・拒否を同じ手動コピー案内にまとめる。
            void Promise.resolve().then(() => navigator.clipboard.writeText(bookmarklet)).then(() => {
              setMessage('コードをコピーしました');
            }, () => {
              setMessage('コードのコピーに失敗しました。選択されたコードを手動でコピーしてください');
              setShowCode(true);
            });
          }}>コードをコピー</Button>
        </div>
        {message && <p role="status">{message}</p>}
        {showCode && <label className="ImportView-field">ブックマークレットのコード
          <textarea readOnly rows={4} value={bookmarklet} ref={element => { element?.focus(); element?.select(); }} />
        </label>}
        <p className="ImportView-note">自分のデッキはログインした状態で詳細ページを開けば実行できます（公開設定は不要）</p>
      </div>
    </details>
    <form className="ImportView-paste" onSubmit={event => {
      event.preventDefault();
      if (state.status !== 'ready') return;
      const parsed = parseDeckText(text, name => state.db.findByExactName(name).length > 0);
      setErrors(parsed.errors);
      if (!parsed.payload) return;
      const checked = validatePayload(parsed.payload);
      if (!checked.ok) { setErrors([{ line: 1, message: checked.error }]); return; }
      onImport(checked.value);
    }}>
      <label className="ImportView-field">デッキリストまたはブックマークレットの JSON を貼り付け
        <textarea rows={5} value={text} onChange={event => setText(event.target.value)} />
      </label>
      {errors.length > 0 && <ul role="alert" className="ImportView-error">{errors.map((error, index) =>
        <li key={index}>{error.line} 行目: {error.message}</li>)}</ul>}
      {showDbStatus && state.status === 'loading' && <p role="status">カードデータを読み込み中</p>}
      {showDbStatus && state.status === 'error' && <div><p role="alert">{state.error}</p><Button onClick={state.retry}>再試行</Button></div>}
      <Button type="submit" disabled={state.status !== 'ready' || !text.trim()}>取り込む</Button>
    </form>
  </div>;
}
