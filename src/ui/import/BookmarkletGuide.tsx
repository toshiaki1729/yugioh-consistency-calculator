import { useState } from 'react';
import type { MouseEvent } from 'react';
import { buildBookmarkletUrl } from '../../importer/bookmarklet';
import { Button } from '../common/Button';

const SMARTPHONE_INSTRUCTIONS = 'スマートフォン: 下のボタンでコードをコピー → 任意のページをブックマークし、URL をコピーしたコードに書き換える → 公式カードデータベースでデッキの詳細ページを開き、アドレスバーにブックマーク名を入力して選ぶ';

const LOADER_NOTE = '実行すると、この計算機の公開ページから取り込み用のプログラムを読み込みます（デッキの内容や開いているページの URL は送りません）';

/** ブックマークレットの登録・コピー手順と失敗時の手動コピー欄を表示する。 */
export function BookmarkletGuide() {
  const [message, setMessage] = useState('');
  const [shouldShowCode, setShouldShowCode] = useState(false);
  const [bookmarklet] = useState(() => buildBookmarkletUrl(location.origin + location.pathname));
  function handleLinkClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setMessage('ブックマークに登録してから、公式カードデータベースのデッキ詳細ページで使います');
  }
  function handleCopy() {
    setShouldShowCode(false);
    // Clipboard API の未提供・同期例外・拒否を同じ手動コピー案内にまとめる。
    void Promise.resolve().then(() => navigator.clipboard.writeText(bookmarklet)).then(() => {
      setMessage('コードをコピーしました');
    }, () => {
      setMessage('コードのコピーに失敗しました。選択されたコードを手動でコピーしてください');
      setShouldShowCode(true);
    });
  }
  function selectCode(element: HTMLTextAreaElement | null) {
    element?.focus();
    element?.select();
  }
  return <details>
    <summary>公式カードデータベースから取り込む</summary>
    <div className="ImportView-guide">
      <p>PC: 下のリンクをブックマークバーへドラッグ → 公式カードデータベース（遊戯王ニューロン）でデッキの詳細ページを開く → ブックマークを実行</p>
      <p>{SMARTPHONE_INSTRUCTIONS}</p>
      <div className="ImportView-actions">
        <a ref={element => element?.setAttribute('href', bookmarklet)}
          draggable onClick={handleLinkClick}>初動率計算機に取り込む</a>
        <Button onClick={handleCopy}>コードをコピー</Button>
      </div>
      {message && <p role="status">{message}</p>}
      {shouldShowCode && <label className="ImportView-field">ブックマークレットのコード
        <textarea readOnly rows={4} value={bookmarklet} ref={selectCode} />
      </label>}
      <p className="ImportView-note">自分のデッキはログインした状態で詳細ページを開けば実行できます（公開設定は不要）</p>
      <p className="ImportView-note">{LOADER_NOTE}</p>
    </div>
  </details>;
}
