import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { createCardDb } from '../src/carddb/loader';
import { convertCards } from '../src/carddb/convert';
import sample from './fixtures/yaml-yugi-sample.json';

const db = createCardDb(convertCards(sample, '2026-11-15T00:00:00.000Z').db);
const storage = { getItem: () => null, setItem: () => {} };
const sourceUrl = 'https://github.com/toshiaki1729/yugioh-consistency-calculator/tree/abc123';
const sourceLabel = '本アプリのソースコード（AGPL-3.0-or-later）';
const licenseLabel = '本アプリのライセンス: AGPL-3.0-or-later';

afterEach(() => vi.unstubAllEnvs());

describe('フッターのソースとライセンス', () => {
  it('HTTPSのソースURLがあれば一致するリンクとライセンスを表示する', () => {
    vi.stubEnv('VITE_SOURCE_URL', sourceUrl);
    render(<App db={db} storage={storage} />);
    const footer = within(screen.getByRole('contentinfo', { name: '出典' }));
    expect(footer.getByRole('link', { name: sourceLabel })).toHaveAttribute('href', sourceUrl);
    expect(footer.getByText(sourceLabel)).toBeVisible();
    expect(footer.queryByText(licenseLabel)).not.toBeInTheDocument();
    expect(footer.getByRole('link', { name: 'yaml-yugi' })).toHaveAttribute(
      'href', 'https://github.com/DawnbrandBots/yaml-yugi',
    );
  });

  it.each([undefined, '', 'javascript:alert(1)', 'http://example.com/source'])(
    'ソースURLが %s のときはリンクを表示せずライセンスを表示する', value => {
      vi.stubEnv('VITE_SOURCE_URL', value);
      render(<App db={db} storage={storage} />);
      const footer = within(screen.getByRole('contentinfo', { name: '出典' }));
      expect(footer.queryByRole('link', { name: sourceLabel })).not.toBeInTheDocument();
      expect(footer.getByText(licenseLabel)).toBeVisible();
      expect(footer.getAllByRole('link')).toHaveLength(1);
    },
  );

  it('再描画時に環境変数を読み直す', () => {
    vi.stubEnv('VITE_SOURCE_URL', undefined);
    const view = render(<App db={db} storage={storage} />);
    expect(screen.getByText(licenseLabel)).toBeVisible();

    vi.stubEnv('VITE_SOURCE_URL', sourceUrl);
    view.rerender(<App db={db} storage={storage} />);
    expect(screen.getByRole('link', { name: sourceLabel })).toHaveAttribute('href', sourceUrl);

    vi.stubEnv('VITE_SOURCE_URL', undefined);
    view.rerender(<App db={db} storage={storage} />);
    expect(screen.queryByRole('link', { name: sourceLabel })).not.toBeInTheDocument();
    expect(screen.getByText(licenseLabel)).toBeVisible();
  });
});
