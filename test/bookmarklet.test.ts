// @vitest-environment happy-dom
import { Window, type HTMLDivElement, type HTMLTextAreaElement, type HTMLButtonElement } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import source from '../src/importer/bookmarklet.src.js?raw';
import { buildBookmarkletUrl } from '../src/importer/bookmarklet';
import { buildBookmarkletScript } from '../scripts/bookmarkletScript.mjs';
import { decodePayload, validatePayload } from '../src/importer/payload';
import { buildCardFromDetail } from '../src/importer/pageData';
import fixture from './fixtures/neuron-deck-sample.html?raw';

const appUrl = 'https://example.test/shodou/';
let page: Window;
let open: ReturnType<typeof vi.fn>;
let alert: ReturnType<typeof vi.fn>;
let writeText: ReturnType<typeof vi.fn>;
let execCommand: ReturnType<typeof vi.fn>;
let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  page = new Window({ url: 'https://www.db.yugioh-card.com/yugiohdb/member_deck.action?ope=1' });
  page.document.write(fixture);
  open = vi.fn(() => ({}));
  alert = vi.fn();
  writeText = vi.fn(() => Promise.resolve());
  execCommand = vi.fn(() => true);
  assign = vi.fn();
  Object.assign(page, { open, alert, TextEncoder });
  Object.defineProperty(page.location, 'assign', { configurable: true, value: assign });
  Object.defineProperty(page.navigator, 'clipboard', { configurable: true, value: { writeText } });
  Object.defineProperty(page.document, 'execCommand', { configurable: true, value: execCommand });
});

afterEach(async () => { await page.happyDOM.close(); });

function run() {
  page.eval(`(${source})(${JSON.stringify(appUrl)})`);
}

function makeOversizedDeck() {
  const body = page.document.querySelector('#monster_list tbody')!;
  const row = body.querySelector('tr.row')!;
  row.querySelector('td.card_name span')!.textContent = '名'.repeat(100);
  for (let i = 0; i < 192; i++) body.appendChild(row.cloneNode(true));
}

function sentPayload(url = open.mock.calls[0][0] as string) {
  expect(url.startsWith(appUrl + '#import=')).toBe(true);
  const result = decodePayload(url.slice((appUrl + '#import=').length));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('自己完結したブックマークレット', () => {
  it('空行を拾わずmain6件・extra2件・side0件を送信し、グローバルを増やさない', () => {
    const globals = Object.getOwnPropertyNames(page).sort();
    run();
    expect(Object.getOwnPropertyNames(page).sort()).toEqual(globals);
    const payload = sentPayload();
    expect(payload.source).toBe('neuron-bookmarklet');
    expect(payload).not.toHaveProperty('deckName');
    expect(payload.cards.filter(card => card.section === 'main')).toHaveLength(6);
    expect(payload.cards.filter(card => card.section === 'extra')).toHaveLength(2);
    expect(payload.cards.filter(card => card.section === 'side')).toHaveLength(0);
    expect(payload.cards.map(card => card.cid)).toEqual([14089, 11785, 11737, 4342, 5114, 12347, 14039, 11667]);
    expect(payload.cards[0]).toMatchObject({
      cid: 14089, name: '守護竜ユスティア', count: 1, section: 'main',
      detail: { attr: '水属性', levelRank: 'レベル 2', species: '【 ドラゴン族 ／ チューナー／通常 】', atk: '攻撃力 0', def: '守備力 2100' },
    });
    expect(payload.cards[0].detail?.text).toContain('天命は果たされる。\n神の門');
    expect(payload.cards[0].detail?.text).toContain('\n\n――');
    expect(writeText).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it.each([
    ['https://example.test/shodou/bookmarklet.js?t=1', appUrl],
    ['https://example.test/bookmarklet.js?t=1', 'https://example.test/'],
  ])('配信する本体は置き場所（%s）をアプリのURLとして同じpayloadを送る', (scriptUrl, expectedAppUrl) => {
    run();
    const expected = sentPayload();
    open.mockClear();
    const script = buildBookmarkletScript(source);
    expect(script).toMatch(/^[\x00-\x7f]*$/);
    Object.defineProperty(page.document, 'currentScript', { configurable: true, value: { src: scriptUrl } });
    page.eval(script);
    const url = open.mock.calls[0][0] as string;
    expect(url.startsWith(expectedAppUrl + '#import=')).toBe(true);
    expect(decodePayload(url.slice((expectedAppUrl + '#import=').length))).toEqual({ ok: true, value: expected });
    expect(source.trim().startsWith('(function (appUrl) {')).toBe(true);
    expect(source.trim().endsWith('})')).toBe(true);
  });

  it('本体の改行をすべて空白に置き換えても同じpayloadを送る', () => {
    run();
    const expected = sentPayload();
    open.mockClear();
    page.eval(`(${source.replace(/[\r\n]/g, ' ')})(${JSON.stringify(appUrl)})`);
    expect(sentPayload()).toEqual(expected);
  });

  it('フィクスチャの詳細3行をCardDataに変換する', () => {
    run();
    const payload = sentPayload();
    const cards = payload.cards.filter(card => card.detail).map(card => buildCardFromDetail(card.cid!, card.name, card.detail!));
    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({ id: 'k14089', kind: 'monster', attribute: 'water', race: 'ドラゴン族',
      monsterTypes: ['normal', 'tuner'], level: 2, atk: 0, def: 2100 });
    expect(cards[1]).toMatchObject({ id: 'k11737', kind: 'spell', monsterTypes: [] });
    expect(cards[2]).toMatchObject({ id: 'k14039', kind: 'monster', attribute: 'earth', race: 'アンデット族',
      monsterTypes: ['effect', 'synchro'], level: 3, atk: 800, def: 2100 });
  });

  it('詳細cidはinput.cidからも取得でき、文字列の空白を正規化する', () => {
    const row = page.document.querySelector('#detailtext_main .t_row')!;
    row.querySelector('input.link_value')!.remove();
    row.querySelector('.box_card_attribute')!.textContent = '\n 水属性　 \t';
    run();
    expect(sentPayload().cards[0].detail?.attr).toBe('水属性');
  });

  it('8,000文字を超えても60,000文字以内ならtextを保持して送る', () => {
    const text = '長文'.repeat(900);
    page.document.querySelector('.box_card_text')!.textContent = text;
    run();
    const url = open.mock.calls[0][0] as string;
    expect(url.length).toBeGreaterThan(8000);
    expect(url.length).toBeLessThanOrEqual(60000);
    expect(sentPayload().cards[0].detail?.text).toBe(text);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('URLが60,000文字を超えたらdetail.textを除いて送る', () => {
    page.document.querySelector('.box_card_text')!.textContent = '長文'.repeat(10000);
    run();
    expect((open.mock.calls[0][0] as string).length).toBeLessThanOrEqual(60000);
    const payload = sentPayload();
    for (const card of payload.cards) expect(card.detail?.text).toBeUndefined();
    expect(payload.cards[0].detail?.attr).toBe('水属性');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('text除去後も60,000文字超ならdetailをすべて除いて送る', () => {
    page.document.querySelector('.box_card_text')!.textContent = '長文'.repeat(10000);
    page.document.querySelector('.box_card_attribute')!.textContent = '属性'.repeat(10000);
    run();
    expect((open.mock.calls[0][0] as string).length).toBeLessThanOrEqual(60000);
    const payload = sentPayload();
    expect(payload.cards).toHaveLength(8);
    for (const card of payload.cards) expect(card).not.toHaveProperty('detail');
    expect(payload.cards[0]).toEqual({ name: '守護竜ユスティア', count: 1, section: 'main', cid: 14089 });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('detail全除去後も60,000文字超ならURLを開かずコピーする', async () => {
    makeOversizedDeck();
    run();
    await Promise.resolve();
    expect(open).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(writeText.mock.calls[0][0]);
    expect(validatePayload(payload).ok).toBe(true);
    expect(payload.cards).toHaveLength(200);
    for (const card of payload.cards) expect(card).not.toHaveProperty('detail');
    expect(alert).toHaveBeenCalledWith('コピーしました。アプリの取り込み欄に貼り付けてください');
  });

  it('PCでは新しいタブで開き、同じタブは移動しない', () => {
    run();
    expect(open).toHaveBeenCalledWith(expect.any(String), '_blank');
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(['null', 'throws'])('ポップアップが%sなら同じタブでアプリを開く', async mode => {
    if (mode === 'null') open.mockReturnValue(null);
    else open.mockImplementation(() => { throw new Error('タブを開けません'); });
    run();
    await Promise.resolve();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(sentPayload(assign.mock.calls[0][0]).cards).toHaveLength(8);
    expect(writeText).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('新しいタブも同じタブも開けなければコピーに切り替える', async () => {
    open.mockReturnValue(null);
    assign.mockImplementation(() => { throw new Error('移動できません'); });
    run();
    await Promise.resolve();
    expect(validatePayload(JSON.parse(writeText.mock.calls[0][0])).ok).toBe(true);
    expect(alert).toHaveBeenCalledWith('コピーしました。アプリの取り込み欄に貼り付けてください');
  });

  it('Clipboard APIの拒否ならexecCommandへフォールバックする', async () => {
    makeOversizedDeck();
    writeText.mockRejectedValue(new Error('拒否'));
    run();
    await Promise.resolve();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(page.document.querySelector('#shodou-calc-import-copy')).toBeNull();
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it.each(['absent', 'throws', 'getter'])('Clipboard APIが%sでも旧APIを試す', async mode => {
    makeOversizedDeck();
    if (mode === 'absent') Object.defineProperty(page.navigator, 'clipboard', { value: undefined });
    else if (mode === 'getter') Object.defineProperty(page.navigator, 'clipboard', { get() { throw new Error('拒否'); } });
    else writeText.mockImplementation(() => { throw new Error('拒否'); });
    run();
    await Promise.resolve();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it.each(['false', 'throws', 'absent'])('旧APIが%sなら手動コピー枠を残し成功通知しない', async mode => {
    makeOversizedDeck();
    writeText.mockRejectedValue(new Error('拒否'));
    if (mode === 'false') execCommand.mockReturnValue(false);
    else if (mode === 'throws') execCommand.mockImplementation(() => { throw new Error('拒否'); });
    else Object.defineProperty(page.document, 'execCommand', { value: undefined });
    run();
    await Promise.resolve();
    const frame = page.document.querySelector('#shodou-calc-import-copy') as HTMLDivElement;
    expect(frame.style.position).toBe('fixed');
    const textarea = frame.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.readOnly).toBe(true);
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe(textarea.value.length);
    expect(validatePayload(JSON.parse(textarea.value)).ok).toBe(true);
    expect(alert).not.toHaveBeenCalled();
    run();
    await Promise.resolve();
    expect(page.document.querySelectorAll('#shodou-calc-import-copy')).toHaveLength(1);
    const close = [...page.document.querySelectorAll('#shodou-calc-import-copy button')]
      .find(button => button.textContent === '閉じる') as HTMLButtonElement;
    close.click();
    expect(page.document.querySelector('#shodou-calc-import-copy')).toBeNull();
  });

  function openManualCopy() {
    makeOversizedDeck();
    writeText.mockRejectedValue(new Error('拒否'));
    execCommand.mockReturnValue(false);
    run();
  }

  function clickCopyButton() {
    const copy = [...page.document.querySelectorAll('#shodou-calc-import-copy button')]
      .find(button => button.textContent === 'コピー') as HTMLButtonElement;
    copy.click();
  }

  it('コピーボタンで旧APIが失敗してもClipboard APIでコピーできれば閉じる', async () => {
    openManualCopy();
    await Promise.resolve();
    await Promise.resolve();
    writeText.mockResolvedValue(undefined);
    clickCopyButton();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(page.document.querySelector('#shodou-calc-import-copy')).toBeNull();
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('コピーボタンでも両方失敗すれば手動コピー枠を残す', async () => {
    openManualCopy();
    await Promise.resolve();
    await Promise.resolve();
    clickCopyButton();
    await Promise.resolve();
    await Promise.resolve();
    expect(page.document.querySelector('#shodou-calc-import-copy')).not.toBeNull();
    expect(alert).not.toHaveBeenCalled();
  });

  it('手動コピー枠のコピーボタンを押すと、その操作でもう一度コピーする', async () => {
    makeOversizedDeck();
    writeText.mockRejectedValue(new Error('拒否'));
    execCommand.mockReturnValue(false);
    run();
    await Promise.resolve();
    await Promise.resolve();
    execCommand.mockReturnValue(true);
    const copy = [...page.document.querySelectorAll('#shodou-calc-import-copy button')]
      .find(button => button.textContent === 'コピー') as HTMLButtonElement;
    copy.click();
    expect(page.document.querySelector('#shodou-calc-import-copy')).toBeNull();
    expect(alert).toHaveBeenCalledWith('コピーしました。アプリの取り込み欄に貼り付けてください');
  });

  it('表が無いページでは送信せず案内を出す', () => {
    page.document.body.textContent = '';
    run();
    expect(open).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('公式カードデータベースのデッキ詳細ページで実行してください');
  });
});

describe('ブックマークに登録する読み込み用コード', () => {
  function runLoader(url: string) {
    const appended: HTMLScriptElement[] = [];
    vi.spyOn(page.document.documentElement, 'appendChild')
      .mockImplementation(node => { appended.push(node as unknown as HTMLScriptElement); return node; });
    expect(url.startsWith('javascript:')).toBe(true);
    page.eval(decodeURIComponent(url.slice('javascript:'.length)));
    expect(appended).toHaveLength(1);
    return appended[0];
  }

  it('アプリと同じ場所の本体を、Refererを送らずに毎回読み込む', () => {
    const script = runLoader(buildBookmarkletUrl(appUrl));
    expect(script.tagName).toBe('SCRIPT');
    expect(script.src).toMatch(/^https:\/\/example\.test\/shodou\/bookmarklet\.js\?t=\d+$/);
    expect(script.referrerPolicy).toBe('no-referrer');
    expect(open).not.toHaveBeenCalled();
  });

  it('評価結果はundefinedで、元のページを書き換えない', () => {
    vi.spyOn(page.document.documentElement, 'appendChild').mockImplementation(node => node);
    const url = buildBookmarkletUrl(appUrl);
    expect(page.eval(decodeURIComponent(url.slice('javascript:'.length)))).toBeUndefined();
  });

  it('実行するたびに異なる時刻を付けて読み込む', () => {
    const now = vi.spyOn(page.Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    const url = buildBookmarkletUrl(appUrl);
    expect(runLoader(url).src).toBe(appUrl + 'bookmarklet.js?t=1000');
    vi.mocked(page.document.documentElement.appendChild).mockRestore();
    expect(runLoader(url).src).toBe(appUrl + 'bookmarklet.js?t=2000');
    now.mockRestore();
  });

  it.each(['onload', 'onerror'] as const)('%sでは読み込み用のscriptを取り除く', handler => {
    const script = runLoader(buildBookmarkletUrl(appUrl));
    const remove = vi.spyOn(script, 'remove');
    script[handler]!(new page.Event(handler.slice(2)) as unknown as Event);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('アプリのURLがindex.htmlでも同じ場所の本体を読み込む', () => {
    const script = runLoader(buildBookmarkletUrl(appUrl + 'index.html'));
    expect(script.src).toMatch(/^https:\/\/example\.test\/shodou\/bookmarklet\.js\?t=\d+$/);
  });

  it('読み込みに失敗したら案内を出す', () => {
    const script = runLoader(buildBookmarkletUrl(appUrl));
    script.onerror!(new page.Event('error') as unknown as Event);
    expect(alert).toHaveBeenCalledWith('初動率計算機から、取り込み用のプログラムを読み込めませんでした');
  });

  it('Android の Chrome の上限 5,000 文字より十分短い（1,000 文字以下）', () => {
    const longAppUrl = 'https://example.test/' + 'a'.repeat(200) + '/';
    expect(buildBookmarkletUrl(longAppUrl).length).toBeLessThanOrEqual(1000);
  });
});
