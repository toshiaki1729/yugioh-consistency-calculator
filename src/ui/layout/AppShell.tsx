import type { ReactNode } from 'react';
import { ResultPanel } from './ResultPanel';
import { ErrorBoundary } from './ErrorBoundary';
import { useAppState, useSaveStatus } from '../../state/store';
import { useCardDb } from '../../carddb/useCardDb';
import './layout.css';

/** 編集エリア・計算結果・出典を共通レイアウトに配置する。 */
export function AppShell({ children, header }: { children: ReactNode; header?: ReactNode }) {
  const { activeDeck } = useAppState();
  const saveStatus = useSaveStatus();
  const cardDb = useCardDb();
  const sourceUrl = getSourceUrl(import.meta.env.VITE_SOURCE_URL);
  const generatedAt = cardDb.status === 'ready' ? cardDb.db.generatedAt : undefined;
  const generatedLabel = cardDb.status === 'ready'
    ? formatGeneratedDate(cardDb.db.generatedAt) : null;
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>初動率計算機</h1>
        {header}
      </header>
      <main className="app-main">
        <ErrorBoundary saveStatus={saveStatus} activeDeck={activeDeck}>
          <div className="editor-panel">{children}</div>
          <ResultPanel />
        </ErrorBoundary>
      </main>
      <footer className="app-footer" aria-label="出典">
        <p>カードデータ: <a href="https://github.com/DawnbrandBots/yaml-yugi">yaml-yugi</a>（AGPL-3.0）。カードテキスト © Studio Dice/SHUEISHA, TV TOKYO, KONAMI。本アプリは非公式のファンメイドツールです</p>
        {generatedLabel && <p>カードDB 生成: <time dateTime={generatedAt}>{generatedLabel}</time></p>}
        <p>{sourceUrl
          ? <a href={sourceUrl}>本アプリのソースコード（AGPL-3.0-or-later）</a>
          : '本アプリのライセンス: AGPL-3.0-or-later'}</p>
      </footer>
    </div>
  );
}

function getSourceUrl(value: string | undefined): string | undefined {
  return value?.startsWith('https://') ? value : undefined;
}

function formatGeneratedDate(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
