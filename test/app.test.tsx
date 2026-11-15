import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../src/App';

describe('アプリの骨格', () => {
  it('アプリ名と初期タブ、結果パネル、フッターを表示する', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '初動率計算機', level: 1 })).toBeVisible();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'デッキ' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'デッキ' })).toBeVisible();
    expect(screen.getByRole('complementary', { name: '計算結果' })).toBeVisible();
    expect(screen.getByRole('contentinfo', { name: '出典' })).toBeInTheDocument();
  });

  it('クリックでタブと表示パネルを切り替える', async () => {
    const user = userEvent.setup();
    render(<App />);

    for (const name of ['カードグループ', '初動パターン', 'デッキ']) {
      await user.click(screen.getByRole('tab', { name }));
      expect(screen.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel', { name })).toBeVisible();
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    }
  });

  it('左右矢印で循環し、Home/Endで両端へ移動できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.tab();
    expect(screen.getByRole('tab', { name: 'デッキ' })).toHaveFocus();

    const moves = [
      ['{ArrowLeft}', '初動パターン'],
      ['{ArrowRight}', 'デッキ'],
      ['{ArrowRight}', 'カードグループ'],
      ['{End}', '初動パターン'],
      ['{Home}', 'デッキ'],
    ];
    for (const [key, name] of moves) {
      await user.keyboard(key);
      const tab = screen.getByRole('tab', { name });
      expect(tab).toHaveFocus();
      expect(tab).toHaveAttribute('aria-selected', 'true');
      expect(tab).toHaveAttribute('tabindex', '0');
      expect(screen.getByRole('tabpanel', { name })).toBeVisible();
      for (const inactive of screen.getAllByRole('tab').filter((item) => item !== tab)) {
        expect(inactive).toHaveAttribute('tabindex', '-1');
      }
    }
    await user.tab();
    expect(screen.getByRole('tabpanel', { name: 'デッキ' })).toHaveFocus();
  });
});
