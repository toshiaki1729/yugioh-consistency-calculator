import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convertCard, convertCards, raceTranslations } from '../src/carddb/convert';
import type { CardDbFile } from '../src/carddb/convert';
import { createCardDb, createCardDbLoader } from '../src/carddb/loader';
import { searchCards } from '../src/carddb/search';
import { races } from '../src/domain/labels';
import { normalizeForMatch } from '../src/domain/normalize';
import sample from './fixtures/yaml-yugi-sample.json';

const { db: file, stats } = convertCards(sample, '2026-11-15T00:00:00.000Z');
const db = createCardDb(file);
const base = sample[0];

describe('yaml-yugi の変換', () => {
  it('17枚を除外・警告なしで変換し、IDの数値順に並べる', () => {
    expect(stats).toEqual({ converted: 17, skipped: 0, warnings: 0, warningCounts: {} });
    expect(file).toMatchObject({ version: 1, source: 'yaml-yugi' });
    const ids = file.cards.map((card) => card.konamiId!);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    for (const card of file.cards) expect(card.id).toBe(`k${card.konamiId}`);
  });

  it('灰流うららの名前・読み・種族・ステータスを変換する', () => {
    expect(db.getCard('k12950')).toMatchObject({
      name: '灰流うらら', kana: 'はるうらら', race: 'アンデット族',
      monsterTypes: ['tuner', 'effect'], attribute: 'fire', level: 3, atk: 0, def: 1800,
      text: base.text.ja,
    });
    expect(db.getCard('k4007')?.kana).toBe('ブルーアイズ・ホワイト・ドラゴン');
  });

  it.each([
    ['強欲な壺', 'spell', 'normal'], ['墓穴の指名者', 'spell', 'quickplay'],
    ['フュージョン・ゲート', 'spell', 'field'], ['デモンズ・チェーン', 'trap', 'continuous'],
  ])('%sの種類を変換する', (name, kind, property) => {
    expect(db.findByExactName(name)[0]).toMatchObject({ kind, property, monsterTypes: [] });
  });

  it('リンク・エクシーズ・ペンデュラム・不定攻守を変換する', () => {
    expect(db.getCard('k15032')?.link).toBe(4);
    expect(db.getCard('k15032')).not.toHaveProperty('def');
    expect(db.getCard('k15032')).not.toHaveProperty('kana');
    expect(db.getCard('k9575')).toMatchObject({ name: 'Ｎｏ．３９ 希望皇ホープ', rank: 4 });
    expect(db.getCard('k9575')).not.toHaveProperty('level');
    expect(db.getCard('k11213')).toMatchObject({ scale: 4, monsterTypes: ['pendulum', 'effect'] });
    expect(db.getCard('k11213')?.pendulumText).toBe(sample.find((card) => card.konami_id === 11213)?.pendulum_effect?.ja);
    expect(db.getCard('k14809')).toMatchObject({ atk: null, def: null });
  });

  it('26種族の日本語表記が既存の一覧と一致する', () => {
    expect(Object.keys(raceTranslations)).toHaveLength(26);
    expect(new Set(Object.values(raceTranslations))).toEqual(new Set(races));
    for (const [english, japanese] of Object.entries(raceTranslations)) {
      expect(convertCard({ ...base, monster_type_line: `${english} / Effect` }).card?.race).toBe(japanese);
    }
  });

  it('全モンスター種別・属性・魔法罠種別を変換する', () => {
    const types = 'Normal / Effect / Fusion / Ritual / Synchro / Xyz / Pendulum / Link / Tuner / Flip / Toon / Spirit / Union / Gemini / Special Summon';
    expect(convertCard({ ...base, monster_type_line: `Dragon / ${types}` }).card?.monsterTypes).toEqual([
      'normal', 'effect', 'fusion', 'ritual', 'synchro', 'xyz', 'pendulum', 'link',
      'tuner', 'flip', 'toon', 'spirit', 'union', 'gemini', 'special',
    ]);
    for (const attribute of ['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE']) {
      expect(convertCard({ ...base, attribute }).card?.attribute).toBe(attribute.toLowerCase());
    }
    for (const property of ['Normal', 'Continuous', 'Equip', 'Field', 'Ritual', 'Counter']) {
      expect(convertCard({ ...base, card_type: 'Spell', property }).card?.property).toBe(property.toLowerCase());
    }
  });

  it('ルビ内外の文字参照をタグ除去後にデコードする', () => {
    const converted = convertCard({ ...base, name: {
      ja: '<ruby>A&amp;&lt;B&gt;<rt>エー&amp;&#66;&#x43;</rt></ruby>&quot;&#39;&#x1F409;',
    } });
    expect(converted.card).toMatchObject({ name: 'A&<B>"\'🐉', kana: 'エー&BC"\'🐉' });
    expect(convertCard({ ...base, name: { ja: '&#x110000;&#xD800;' } }).card?.name).toBe('\uFFFD\uFFFD');
  });

  it('ID・日本語名がないカードを除外する', () => {
    const result = convertCards([...sample, { ...base, konami_id: undefined }, { ...base, name: { en: 'A' } }], 'test');
    expect(result.stats).toMatchObject({ converted: 17, skipped: 2, warnings: 0 });
    for (const raw of [null, 5, [], { ...base, konami_id: null }, { ...base, name: { ja: '' } }]) {
      expect(convertCard(raw).skipped).toBeTruthy();
    }
  });

  it('未知の種族は保持し、未知の種類を無視して警告を集計する', () => {
    const raw = { ...base, konami_id: 99999, monster_type_line: 'New Race / New Type / Effect' };
    const result = convertCards([...sample, raw], 'test');
    expect(result.db.cards.at(-1)).toMatchObject({ race: 'New Race', monsterTypes: ['effect'] });
    expect(result.stats).toEqual({
      converted: 18, skipped: 0, warnings: 2,
      warningCounts: { '未知の種族': 1, '未知のモンスターの種類': 1 },
    });
    expect(convertCard({ ...base, card_type: 'Future' })).toMatchObject({ warnings: ['未知の card_type'] });
  });

  it.each(['invalid', null, {}, [], -1, 1.5, Infinity, NaN])('不正な数値 %j を落として警告する', (value) => {
    const result = convertCard({
      ...base, level: value, rank: value, pendulum_scale: value, atk: value, def: value, link_arrows: value,
    });
    const expectedWarnings = Array.isArray(value) ? 5 : 6;
    expect(result.warnings).toHaveLength(expectedWarnings);
    for (const key of ['level', 'rank', 'scale', 'atk', 'def']) expect(result.card).not.toHaveProperty(key);
  });

  it('数値型でnullを許さない項目の?は省略する', () => {
    const result = convertCard({ ...base, level: '?', rank: '?', pendulum_scale: '?', link_arrows: '?' });
    expect(result.warnings).toHaveLength(4);
    for (const key of ['level', 'rank', 'scale', 'link']) expect(result.card).not.toHaveProperty(key);
  });

  it('未知の属性・プロパティ・不正な本文も変換を止めない', () => {
    expect(convertCard({ ...base, attribute: 'Future', text: { ja: 12 }, pendulum_effect: { ja: false } }))
      .toMatchObject({ card: { text: '' }, warnings: ['不正な text.ja', '不正な pendulum_effect.ja', '未知の attribute'] });
    expect(convertCard({ ...base, card_type: 'Spell', property: 'Future' }).warnings).toEqual(['未知の property']);
  });
});

describe('索引と検索', () => {
  it.each([
    ['うらら', 'k12950'], ['はる', 'k12950'], ['ホープ', 'k9575'], ['39', 'k9575'],
  ])('%sを名前または読みで検索する', (query, id) => {
    expect(db.search(query).map((card) => card.id)).toContain(id);
  });

  it('完全一致は正規化した名前を使い、重複名をすべて返す', () => {
    const original = db.getCard('k9575')!;
    const duplicate = { ...original, id: 'k99999', konamiId: 99999 };
    const duplicateDb = createCardDb({ ...file, cards: [original, duplicate] });
    expect(duplicateDb.findByExactName('no.39　希望皇ホープ')).toEqual([original, duplicate]);
    expect(duplicateDb.findByExactName('ホープ')).toEqual([]);
    expect(db.getCard('missing')).toBeUndefined();
    expect(db.size).toBe(17);
    expect(db.generatedAt).toBe(file.generatedAt);
  });

  it('前方一致を優先し、長さ・名前順に並べて上限を適用する', () => {
    const names = ['zab', 'abc', 'ab', 'aba', 'abz', 'xab'];
    const index = names.map((name, i) => ({
      card: { ...file.cards[0], id: `k${i}`, name }, name, kana: '',
    }));
    expect(searchCards(index, 'Ａ Ｂ').map((card) => card.name)).toEqual(['ab', 'aba', 'abc', 'abz', 'xab', 'zab']);
    expect(searchCards(index, 'ab', 2).map((card) => card.name)).toEqual(['ab', 'aba']);
    expect(searchCards(index, 'ab', 0)).toEqual([]);
    expect(searchCards(index, '　 ')).toEqual([]);
    const many = Array.from({ length: 40 }, (_, i) => ({ ...index[0], card: { ...index[0].card, id: `k${i}` } }));
    expect(searchCards(many, 'ab')).toHaveLength(30);
    const kana = { ...index[0], kana: normalizeForMatch('ab読み') };
    expect(searchCards([index[5], kana], 'ab')[0]).toBe(kana.card);
  });
});

describe('カードDB loader', () => {
  it('購読先にloading→readyを通知し、解除後は通知しない', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(file)));
    const loader = createCardDbLoader(fetchImpl, '/custom/cards.json');
    expect(loader.getState()).toEqual({ status: 'loading' });
    const listener = vi.fn();
    const unsubscribe = loader.subscribe(listener);
    const state = await loader.load();
    expect(fetchImpl).toHaveBeenCalledWith('/custom/cards.json');
    expect(listener.mock.calls.map(([value]) => value.status)).toEqual(['loading', 'ready']);
    expect(loader.getState()).toBe(state);
    expect(state.status).toBe('ready');
    if (state.status === 'ready') expect(state.db.getCard('k12950')?.name).toBe('灰流うらら');
    unsubscribe();
    fetchImpl.mockResolvedValue(new Response(JSON.stringify(file)));
    await loader.retry();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('HTTP失敗から同じloaderで再試行できる', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(file)));
    const loader = createCardDbLoader(fetchImpl);
    expect(await loader.load()).toEqual({ status: 'error', error: expect.stringContaining('503') });
    expect(fetchImpl).toHaveBeenCalledWith(import.meta.env.BASE_URL + 'data/cards.ja.json');
    expect((await loader.retry()).status).toBe('ready');
  });

  it('ネットワーク失敗・壊れたJSONを日本語エラーとして返す', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response('{broken'));
    const loader = createCardDbLoader(fetchImpl);
    expect(await loader.load()).toMatchObject({ status: 'error', error: expect.stringContaining('再試行') });
    expect((await loader.retry()).status).toBe('error');
  });

  it.each([
    null, { ...file, version: 2 }, { ...file, cards: {} }, { ...file, generatedAt: null },
    { ...file, cards: [null] }, { ...file, cards: [{ ...file.cards[0], id: 1 }] },
    { ...file, cards: [{ ...file.cards[0], name: null }] },
    { ...file, cards: [{ ...file.cards[0], kind: 'future' }] },
    { ...file, cards: [{ ...file.cards[0], kana: 1 }] },
  ])('DBの形式・カードの基本項目を検証する (%#)', async (invalid) => {
    const loader = createCardDbLoader(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(invalid))));
    expect((await loader.load()).status).toBe('error');
  });
});

describe('Node CLI（通信は差し替え）', () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('buildは出力ディレクトリを作り、1行JSONと集計を出力する', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shodou-carddb-'));
    directories.push(directory);
    const input = join(directory, 'input.json');
    const output = join(directory, 'nested', 'cards.json');
    await writeFile(input, JSON.stringify([...sample, { ...base, konami_id: undefined }, {
      ...base, konami_id: 99999, monster_type_line: 'New Race / New Type',
    }]));
    const result = spawnSync(process.execPath, ['scripts/build-cards.mjs', input, output], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('変換 18 件 / 除外 1 件 / 警告 2 件');
    expect(result.stdout).toContain('未知の種族: 1 件');
    expect(result.stdout).toContain('未知のモンスターの種類: 1 件');
    const contents = await readFile(output, 'utf8');
    expect(contents).not.toContain('\n');
    const generated: CardDbFile = JSON.parse(contents);
    expect(generated.cards).toHaveLength(18);
    expect(generated.cards[0].id).toBe('k4007');
    await writeFile(input, '{}');
    expect(spawnSync(process.execPath, ['scripts/build-cards.mjs', input, output]).status).toBe(1);
    await writeFile(input, '{broken');
    expect(spawnSync(process.execPath, ['scripts/build-cards.mjs', input, output]).status).toBe(1);
  });

  it.each([200, 503])('fetchのHTTP %iで保存・終了コードを確認する', async (status) => {
    const directory = await mkdtemp(join(tmpdir(), 'shodou-carddb-'));
    directories.push(directory);
    const script = pathToFileURL(resolve('scripts/fetch-cards.mjs')).href;
    const code = `globalThis.fetch = async (url) => {
      if (url !== 'https://dawnbrandbots.github.io/yaml-yugi/cards.json') throw new Error('unexpected URL');
      return new Response('[]', { status: ${status} });
    }; await import(${JSON.stringify(script)});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], { cwd: directory, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(status === 200 ? 0 : 1);
    if (status === 200) {
      expect(await readFile(join(directory, 'data-src', 'cards.json'), 'utf8')).toBe('[]');
      expect(result.stdout).toContain('2 バイト');
    } else {
      expect(result.stderr).toContain('HTTP 503');
      await expect(readFile(join(directory, 'data-src', 'cards.json'))).rejects.toThrow();
    }
  });
});
