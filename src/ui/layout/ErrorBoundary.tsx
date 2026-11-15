import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import type { Deck } from '../../domain/types';
import { downloadDeck } from '../../state/persist';
import type { SaveStatus } from '../../state/persist';
import { Button } from '../common/Button';

export class ErrorBoundary extends Component<{
  children: ReactNode;
  saveStatus: SaveStatus;
  activeDeck: Deck | null;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('画面の表示中に問題が発生しました。', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { saveStatus, activeDeck } = this.props;
    return <section className="error-boundary" role="alert">
      <h2>問題が発生しました</h2>
      <p>{saveStatus === 'saved' ? 'データは保存されています。' : '最後の変更が保存されていない可能性があります。'}</p>
      <div className="error-boundary-actions">
        <Button onClick={() => location.reload()}>再読み込み</Button>
        {activeDeck && <Button onClick={() => downloadDeck(activeDeck)}>現在のデッキを JSON で書き出す</Button>}
      </div>
    </section>;
  }
}
