import type { ReactNode } from 'react';
import { ResultPanel } from './ResultPanel';
import { ErrorBoundary } from './ErrorBoundary';
import { useAppState, useSaveStatus } from '../../state/store';
import { useCardDb } from '../../carddb/useCardDb';
import './layout.css';

export function AppShell({ children, header }: { children: ReactNode; header?: ReactNode }) {
  const { activeDeck } = useAppState();
  const saveStatus = useSaveStatus();
  const cardDb = useCardDb();
  const generatedAt = cardDb.status === 'ready' ? new Date(cardDb.db.generatedAt) : null;
  const generatedLabel = generatedAt && `${generatedAt.getFullYear()}-${String(generatedAt.getMonth() + 1).padStart(2, '0')}-${String(generatedAt.getDate()).padStart(2, '0')} ${String(generatedAt.getHours()).padStart(2, '0')}:${String(generatedAt.getMinutes()).padStart(2, '0')}`;
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
        {generatedLabel && <p>カードDB 生成: <time dateTime={cardDb.status === 'ready' ? cardDb.db.generatedAt : undefined}>{generatedLabel}</time></p>}
      </footer>
    </div>
  );
}
