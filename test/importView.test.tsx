import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { createCardDb, createCardDbLoader } from '../src/carddb/loader';
import { convertCards } from '../src/carddb/convert';
import { buildBookmarkletUrl } from '../src/importer/bookmarklet';
import { encodePayload } from '../src/importer/payload';
import type { ImportPayload } from '../src/importer/payload';
import { createInitialState } from '../src/state/reducer';
import { STORAGE_KEY } from '../src/state/persist';
import type { AppState } from '../src/domain/types';
import sample from './fixtures/yaml-yugi-sample.json';

const file = convertCards(sample, '2026-11-15T00:00:00.000Z').db;
const db = createCardDb(file);
const payload: ImportPayload = { v: 1, source: 'neuron-bookmarklet', deckName: '取り込み試験',
  cards: [{ name: '灰流うらら', count: 3, section: 'main' }] };
const pasteLabel = 'デッキリストまたはブックマークレットの JSON を貼り付け';

function setup({ loader, state }: { loader?: ReturnType<typeof createCardDbLoader>; state?: AppState } = {}) {
  const user = userEvent.setup();
  render(<StrictMode><App db={loader ? undefined : db} loader={loader} storage={{
    getItem: key => key === STORAGE_KEY && state ? JSON.stringify(state) : null, setItem: vi.fn(),
  }} /></StrictMode>);
  return user;
}

afterEach(() => { history.replaceState(null, '', location.pathname); vi.restoreAllMocks(); });

describe('デッキの取り込み画面', () => {
  it('貼り付けた解決済みカードと未解決1件を候補から選び、合算して一覧に表示する', async () => {
    const user = setup();
    fireEvent.change(screen.getByLabelText(pasteLabel), { target: { value: '2 灰流うらら\n1 うらら' } });
    await user.click(screen.getByRole('button', { name: '取り込む' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('解決済み 1 件 / 未解決 1 件（扱い未選択 1 件）')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: '取り込みを確定' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: '灰流うらら' }));
    expect(within(dialog).getByText('取り込み枚数: メイン 3 枚 / エクストラ 0 枚 / サイド 0 枚')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: '取り込みを確定' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'メイン 3 枚' })).getByRole('listitem', { name: '灰流うらら' })).toBeVisible();
    expect(screen.getByLabelText('デッキ選択')).toHaveDisplayValue('取り込んだデッキ');
  });

  it('起動時のハッシュを消して新規デッキに取り込み、元のデッキを残す', async () => {
    history.replaceState(null, '', `?test=1#import=${encodePayload(payload)}`);
    const user = setup();
    expect(location.hash).toBe('');
    expect(location.search).toBe('?test=1');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('デッキ名')).toHaveValue('取り込み試験');
    expect(within(dialog).getByLabelText('取り込み先')).toHaveValue('new');
    await user.click(within(dialog).getByRole('button', { name: '取り込みを確定' }));
    expect(screen.getByRole('region', { name: 'メイン 3 枚' })).toBeVisible();
    const select = screen.getByLabelText('デッキ選択');
    expect(within(select).getAllByRole('option')).toHaveLength(2);
    expect(select).toHaveDisplayValue('取り込み試験');
  });

  it('hashchange を監視し、別タブで取り込んでも確定後はデッキタブを表示する', async () => {
    const user = setup();
    await user.click(screen.getByRole('tab', { name: 'カードグループ' }));
    act(() => {
      history.replaceState(null, '', `#import=${encodePayload(payload)}`);
      window.dispatchEvent(new Event('hashchange'));
    });
    expect(location.hash).toBe('');
    await user.click(screen.getByRole('button', { name: '取り込みを確定' }));
    expect(screen.getByRole('tab', { name: 'デッキ' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'メイン 3 枚' })).toBeVisible();
  });

  it('DB読み込み中は待ち、エラーの再試行後に解決する', async () => {
    history.replaceState(null, '', `#import=${encodePayload(payload)}`);
    let respond!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise(resolve => { respond = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify(file)));
    const user = setup({ loader: createCardDbLoader(fetcher) });
    expect(within(screen.getByRole('dialog')).getByText('カードDBを読み込み中…')).toBeVisible();
    expect(location.hash).toBe('');
    expect(screen.queryByRole('button', { name: '取り込みを確定' })).not.toBeInTheDocument();
    await act(async () => { respond(new Response('', { status: 503 })); });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('503');
    await user.click(within(dialog).getByRole('button', { name: '再試行' }));
    expect(await within(dialog).findByRole('button', { name: '取り込みを確定' })).toBeEnabled();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('デッキが0件でも貼り付けから新規作成でき、置き換えは禁止する', async () => {
    const state: AppState = { schemaVersion: 1, decks: [], activeDeckId: null, settings: { customHandSize: null } };
    const user = setup({ state });
    fireEvent.change(screen.getByLabelText(pasteLabel), { target: { value: 'メイン\n3 灰流うらら\nエクストラ\n2 灰流うらら\nサイド\n1 灰流うらら' } });
    await user.click(screen.getByRole('button', { name: '取り込む' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('option', { name: '現在のデッキを置き換え' })).toBeDisabled();
    expect(within(dialog).getByText('取り込み枚数: メイン 3 枚 / エクストラ 2 枚 / サイド 1 枚')).toBeVisible();
    await user.clear(within(dialog).getByLabelText('デッキ名'));
    expect(within(dialog).getByRole('button', { name: '取り込みを確定' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('デッキ名'), '初回取り込み');
    await user.click(within(dialog).getByRole('button', { name: '取り込みを確定' }));
    for (const name of ['メイン 3 枚', 'エクストラ 2 枚', 'サイド 1 枚']) {
      expect(within(screen.getByRole('region', { name })).getByRole('listitem', { name: '灰流うらら' })).toBeVisible();
    }
  });

  it('カスタムカードを保留した後でも取り込み全体をキャンセルできる', async () => {
    const user = setup();
    fireEvent.change(screen.getByLabelText(pasteLabel), { target: { value: '2 保留カード' } });
    await user.click(screen.getByRole('button', { name: '取り込む' }));
    await user.click(screen.getByRole('button', { name: 'カスタムカードとして作る' }));
    await user.click(within(screen.getByRole('dialog', { name: 'カスタムカードを作成' })).getByRole('button', { name: '保存' }));
    expect(screen.getByText('カスタムカード: 保留カード')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(screen.queryByRole('region', { name: '登録済みカスタムカード' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'メイン 0 枚' })).toBeVisible();
    expect(within(screen.getByLabelText('デッキ選択')).getAllByRole('option')).toHaveLength(1);
  });

  it('カスタムカードを名前・枚数入りで開き、確定まで保留して区分と枚数を保存する', async () => {
    const user = setup();
    fireEvent.change(screen.getByLabelText(pasteLabel), { target: { value: 'サイド\n3 未収録カード' } });
    await user.click(screen.getByRole('button', { name: '取り込む' }));
    await user.click(screen.getByRole('button', { name: 'カスタムカードとして作る' }));
    const custom = screen.getByRole('dialog', { name: 'カスタムカードを作成' });
    expect(within(custom).getByLabelText('カード名')).toHaveValue('未収録カード');
    expect(within(custom).getByText('取り込み枚数: 3 枚')).toBeVisible();
    await user.click(within(custom).getByRole('button', { name: '保存' }));
    expect(screen.queryByRole('region', { name: '登録済みカスタムカード' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('取り込み先'), 'replace');
    await user.click(screen.getByRole('button', { name: '取り込みを確定' }));
    const side = screen.getByRole('region', { name: 'サイド 3 枚' });
    expect(within(side).getByRole('listitem', { name: '未収録カード' })).toBeVisible();
    expect(screen.getByRole('region', { name: '登録済みカスタムカード' })).toBeVisible();
    expect(within(screen.getByLabelText('デッキ選択')).getAllByRole('option')).toHaveLength(1);
  });

  it('検索して選択・選び直し・取り込まないを選べ、キャンセルでは変更しない', async () => {
    const user = setup();
    fireEvent.change(screen.getByLabelText(pasteLabel), { target: { value: '1 不明なカード' } });
    await user.click(screen.getByRole('button', { name: '取り込む' }));
    const dialog = screen.getByRole('dialog');
    const search = within(dialog).getByRole('combobox', { name: 'カードを検索' });
    await user.type(search, 'うらら');
    await within(dialog).findByRole('option', { name: /灰流うらら/ });
    await user.keyboard('{ArrowDown}{Enter}');
    expect(within(dialog).getByText('選択: 灰流うらら')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: '選び直す' }));
    expect(within(dialog).getByRole('button', { name: '取り込みを確定' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: '取り込まない' }));
    expect(within(dialog).getByRole('button', { name: '取り込みを確定' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
    expect(screen.getByRole('region', { name: 'メイン 0 枚' })).toBeVisible();
    expect(within(screen.getByLabelText('デッキ選択')).getAllByRole('option')).toHaveLength(1);
  });

  it('貼り付けエラーに行番号を表示し、不正なハッシュも消して理由を表示する', async () => {
    const user = setup();
    fireEvent.change(screen.getByLabelText(pasteLabel), { target: { value: '#コメント\nメイン\n61 灰流うらら' } });
    await user.click(screen.getByRole('button', { name: '取り込む' }));
    expect(screen.getByRole('alert')).toHaveTextContent('3 行目: 枚数は 1〜60 の整数で指定してください');
    act(() => {
      history.replaceState(null, '', '#import=%%%');
      window.dispatchEvent(new Event('hashchange'));
    });
    expect(location.hash).toBe('');
    expect(within(screen.getByRole('dialog', { name: '取り込みエラー' })).getByRole('alert')).not.toBeEmptyDOMElement();
  });

  it('確定時の上限エラーではダイアログを残して修正できる', async () => {
    const state = createInitialState();
    state.decks = Array.from({ length: 50 }, (_, index) => ({ ...state.decks[0], id: `d${index}` }));
    state.activeDeckId = 'd0';
    history.replaceState(null, '', `#import=${encodePayload(payload)}`);
    const user = setup({ state });
    await user.click(screen.getByRole('button', { name: '取り込みを確定' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('上限');
    await user.selectOptions(screen.getByLabelText('取り込み先'), 'replace');
    await user.click(screen.getByRole('button', { name: '取り込みを確定' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'メイン 3 枚' })).toBeVisible();
  });

  it('ブックマークレットのクリックを抑止し、コピー成功と拒否時の選択済みコードを表示する', async () => {
    const user = setup();
    await user.click(screen.getByText('公式カードデータベースから取り込む'));
    const link = screen.getByRole('link', { name: '初動率計算機に取り込む' });
    const code = buildBookmarkletUrl(location.origin + location.pathname);
    expect(link).toHaveAttribute('href', code);
    expect(fireEvent.click(link)).toBe(false);
    expect(screen.getByText('ブックマークに登録してから、公式カードデータベースのデッキ詳細ページで使います')).toBeVisible();
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValueOnce().mockRejectedValueOnce(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'コードをコピー' }));
    expect(await screen.findByText('コードをコピーしました')).toBeVisible();
    expect(write).toHaveBeenCalledWith(code);
    await user.click(screen.getByRole('button', { name: 'コードをコピー' }));
    const textarea = await screen.findByLabelText<HTMLTextAreaElement>('ブックマークレットのコード');
    expect(textarea).toHaveValue(code);
    expect(textarea).toHaveAttribute('readonly');
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe(code.length);
  });
});
