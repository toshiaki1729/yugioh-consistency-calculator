// @vitest-environment happy-dom
import { Window, type HTMLDivElement, type HTMLTextAreaElement, type HTMLButtonElement } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import source from '../src/importer/bookmarklet.src.js?raw';
import { buildBookmarkletUrl } from '../src/importer/bookmarklet';
import { decodePayload, validatePayload } from '../src/importer/payload';
import { buildCardFromDetail } from '../src/importer/pageData';
import fixture from './fixtures/neuron-deck-sample.html?raw';

const appUrl = 'https://example.test/shodou/';
let page: Window;
let open: ReturnType<typeof vi.fn>;
let alert: ReturnType<typeof vi.fn>;
let writeText: ReturnType<typeof vi.fn>;
let execCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
  page = new Window({ url: 'https://www.db.yugioh-card.com/yugiohdb/member_deck.action?ope=1' });
  page.document.write(fixture);
  open = vi.fn(() => ({}));
  alert = vi.fn();
  writeText = vi.fn(() => Promise.resolve());
  execCommand = vi.fn(() => true);
  Object.assign(page, { open, alert, TextEncoder });
  Object.defineProperty(page.navigator, 'clipboard', { configurable: true, value: { writeText } });
  Object.defineProperty(page.document, 'execCommand', { configurable: true, value: execCommand });
});

afterEach(async () => { await page.happyDOM.close(); });

function run() {
  page.eval(`(${source})(${JSON.stringify(appUrl)})`);
}

function sentPayload() {
  const url = open.mock.calls[0][0] as string;
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

  it('生成したjavascript URLを実行しても同じpayloadになる', () => {
    run();
    const expected = sentPayload();
    open.mockClear();
    const url = buildBookmarkletUrl(appUrl);
    expect(url.startsWith('javascript:')).toBe(true);
    page.eval(decodeURIComponent(url.slice('javascript:'.length)));
    expect(sentPayload()).toEqual(expected);
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
    const body = page.document.querySelector('#monster_list tbody')!;
    const row = body.querySelector('tr.row')!;
    row.querySelector('td.card_name span')!.textContent = '名'.repeat(100);
    for (let i = 0; i < 192; i++) body.appendChild(row.cloneNode(true));
    run();
    await Promise.resolve();
    expect(open).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(writeText.mock.calls[0][0]);
    expect(validatePayload(payload).ok).toBe(true);
    expect(payload.cards).toHaveLength(200);
    for (const card of payload.cards) expect(card).not.toHaveProperty('detail');
    expect(alert).toHaveBeenCalledWith('コピーしました。アプリの取り込み欄に貼り付けてください');
  });

  it('ポップアップがブロックされたらClipboard APIでコピーする', async () => {
    open.mockReturnValue(null);
    run();
    expect(alert).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(validatePayload(JSON.parse(writeText.mock.calls[0][0])).ok).toBe(true);
    expect(execCommand).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('Clipboard APIの拒否ならexecCommandへフォールバックする', async () => {
    open.mockReturnValue(null);
    writeText.mockRejectedValue(new Error('拒否'));
    run();
    await Promise.resolve();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(page.document.querySelector('#shodou-calc-import-copy')).toBeNull();
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it.each(['absent', 'throws', 'getter'])('Clipboard APIが%sでも旧APIを試す', async mode => {
    open.mockImplementation(() => { throw new Error('タブを開けません'); });
    if (mode === 'absent') Object.defineProperty(page.navigator, 'clipboard', { value: undefined });
    else if (mode === 'getter') Object.defineProperty(page.navigator, 'clipboard', { get() { throw new Error('拒否'); } });
    else writeText.mockImplementation(() => { throw new Error('拒否'); });
    run();
    await Promise.resolve();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it.each(['false', 'throws', 'absent'])('旧APIが%sなら手動コピー枠を残し成功通知しない', async mode => {
    open.mockReturnValue(null);
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
    (page.document.querySelector('#shodou-calc-import-copy button') as HTMLButtonElement).click();
    expect(page.document.querySelector('#shodou-calc-import-copy')).toBeNull();
  });

  it('表が無いページでは送信せず案内を出す', () => {
    page.document.body.textContent = '';
    run();
    expect(open).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('公式カードデータベースのデッキ詳細ページで実行してください');
  });
});
