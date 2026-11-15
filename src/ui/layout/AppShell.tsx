import type { ReactNode } from 'react';
import { ResultPanel } from './ResultPanel';
import './layout.css';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>初動率計算機</h1>
      </header>
      <main className="app-main">
        <div className="editor-panel">{children}</div>
        <ResultPanel />
      </main>
      <footer className="app-footer" aria-label="出典" />
    </div>
  );
}
