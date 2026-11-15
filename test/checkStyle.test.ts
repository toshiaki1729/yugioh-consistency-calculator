import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { checkSource, type Violation } from '../scripts/check-style.mjs';

const script = fileURLToPath(new URL('../scripts/check-style.mjs', import.meta.url));
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'check-style-'));
afterAll(() => rmSync(temporaryRoot, { recursive: true, force: true }));

function checkRule(rule: Violation['rule'], text: string, fileName = 'src/example.ts') {
  return checkSource(fileName, text).filter((item) => item.rule === rule);
}

function createLines(count: number) {
  return Array.from({ length: count }, () => '  work();').join('\n');
}

function runCli(files: Record<string, string>, args: string[] = []) {
  const directory = mkdtempSync(path.join(temporaryRoot, 'case-'));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(directory, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return spawnSync(process.execPath, [script, ...args], { cwd: directory, encoding: 'utf8' });
}

describe('規約 1: 行の長さ', () => {
  it.each(['\n', '\r\n'])('100 文字と 101 文字の境界を扱う（%j）', (newline) => {
    const result = checkRule(1, ['a'.repeat(100), 'a'.repeat(101)].join(newline));
    expect(result).toEqual([{
      file: 'src/example.ts', line: 2, rule: 1, message: '行が 101 文字あります。上限 100 文字',
    }]);
  });

  it('Unicode コードポイント単位で数える', () => {
    expect(checkRule(1, `//${'😀'.repeat(98)}`)).toHaveLength(0);
    expect(checkRule(1, `//${'全'.repeat(99)}`)).toHaveLength(1);
  });

  it.each(["'", '"', '`', '/'])('40 文字以上のリテラルトークンを除外する（%s）', (quote) => {
    const prefix = `const ${'a'.repeat(70)} = `;
    expect(checkRule(1, `${prefix}${quote}${'b'.repeat(38)}${quote};`)).toHaveLength(0);
    expect(checkRule(1, `${prefix}${quote}${'b'.repeat(37)}${quote};`)).toHaveLength(1);
  });

  it('テンプレートの head / middle / tail のトークンも除外する', () => {
    const long = 'a'.repeat(101);
    for (const literal of [`\`${long}\${x}\``, `\`\${x}${long}\${y}\``, `\`\${x}${long}\``]) {
      expect(checkRule(1, `const value = ${literal};`)).toHaveLength(0);
    }
    expect(checkRule(1, `const value = \`\${${'x'.repeat(101)}}\`;`)).toHaveLength(1);
  });

  it('コメントや除算をリテラルと誤認せず、例外を別の行に適用しない', () => {
    expect(checkRule(1, `// "${'a'.repeat(101)}"`)).toHaveLength(1);
    expect(checkRule(1, `const value = a / ${'b'.repeat(101)} / c;`)).toHaveLength(1);
    expect(checkRule(1, `const text = "${'a'.repeat(101)}";\n${'b'.repeat(101)}`)[0].line).toBe(2);
  });
});

describe('規約 2: 関数の長さ', () => {
  it.each(['\n', '\r\n'])('ブロック本体の 50 行と 51 行の境界を扱う（%j）', (newline) => {
    for (const count of [50, 51]) {
      const text = `function example() {\n${createLines(count)}\n}`.replaceAll('\n', newline);
      const result = checkRule(2, text);
      expect(result).toHaveLength(count - 50);
      if (count === 51) expect(result[0].message).toContain('関数 example の本体が 51 行');
    }
  });

  it.each([
    ['function example() {', '}'],
    ['const example = function () {', '};'],
    ['const example = () => {', '};'],
    ['class Example { method() {', '} }'],
    ['class Example { get value() {', '} }'],
    ['class Example { set value(value) {', '} }'],
    ['class Example { constructor() {', '} }'],
  ])('すべての関数系ノードを検査する（%s）', (start, end) => {
    expect(checkRule(2, `${start}\n${createLines(50)}\n${end}`)).toHaveLength(0);
    expect(checkRule(2, `${start}\n${createLines(51)}\n${end}`)).toHaveLength(1);
  });

  it('式本体は式の開始行から終了行までを数える', () => {
    for (const count of [50, 51]) {
      const text = `const example = () => (\n${Array(count - 2).fill('value +').join('\n')}\nvalue);`;
      expect(checkRule(2, text)).toHaveLength(count - 50);
    }
  });

  it('同じ行のブロックと本体のない宣言は違反にしない', () => {
    expect(checkRule(2, 'function example() { work(); }')).toHaveLength(0);
    expect(checkRule(2, 'declare function example(): void;')).toHaveLength(0);
  });

  it('内側の関数の宣言行から終了行までを除き、内側自体は検査する', () => {
    const text = `function outer() {\n${createLines(50)}\nfunction inner() {\n${createLines(51)}\n}\n}`;
    const result = checkRule(2, text);
    expect(result).toHaveLength(1);
    expect(result[0].message).toContain('関数 inner の本体が 51 行');
  });

  it('孫の関数を二重に引かず、外側の 51 行を検出する', () => {
    const text = `function outer() {\n${createLines(51)}\nfunction inner() {\nfunction leaf() {\n${createLines(20)}\n}\n}\n}`;
    const result = checkRule(2, text);
    expect(result).toHaveLength(1);
    expect(result[0].message).toContain('関数 outer の本体が 51 行');
  });

  it('同じ行にある内側関数を重複して引かない', () => {
    const text = `function outer() {\n${createLines(51)}\nconst a = () => 1, b = () => 2;\n}`;
    expect(checkRule(2, text)[0].message).toContain('51 行');
  });

  it('式本体が内側関数の場合も除外する', () => {
    const text = `const outer = () => () => {\n${createLines(51)}\n};`;
    expect(checkRule(2, text)).toHaveLength(1);
  });

  it.each(['src/importer/bookmarklet.src.js', 'C:\\project\\src\\importer\\bookmarklet.src.js'])(
    'ブックマークレットの最外関数式だけを除外する（%s）', (fileName) => {
      const text = `(function (appUrl) {\n${createLines(51)}\nfunction inner() {\n${createLines(51)}\n}\n})`;
      const result = checkRule(2, text, fileName);
      expect(result).toHaveLength(1);
      expect(result[0].message).toContain('関数 inner');
      expect(checkRule(2, text, 'src/other.js')).toHaveLength(2);
    },
  );

  it('ブックマークレットでもファイル全体を包まない関数式は検査する', () => {
    const text = `const callback = function () {\n${createLines(51)}\n};`;
    expect(checkRule(2, text, 'src/importer/bookmarklet.src.js')).toHaveLength(1);
  });
});

describe('規約 3: ファイルの長さ', () => {
  it.each(['\n', '\r\n'])('250 行と 251 行の境界と末尾改行を扱う（%j）', (newline) => {
    for (const ending of ['', newline]) {
      expect(checkRule(3, Array(250).fill('// 行').join(newline) + ending)).toHaveLength(0);
      expect(checkRule(3, Array(251).fill('// 行').join(newline) + ending)[0].line).toBe(1);
    }
    expect(checkRule(3, '')).toHaveLength(0);
  });
});

describe('規約 4: 制御構文の入れ子', () => {
  it.each([
    ['if (ok) {', '}'], ['for (;;) {', '}'], ['for (const key in object) {', '}'],
    ['for (const value of values) {', '}'], ['while (ok) {', '}'], ['do {', '} while (ok);'],
    ['switch (value) { default:', '}'], ['try {', '} catch (error) {}'],
  ])('3 段と 4 段の境界を扱う（%s）', (start, end) => {
    for (const depth of [3, 4]) {
      const text = `function example() {\n${Array(depth).fill(start).join('\n')}\nwork();\n${Array(depth).fill(end).join('\n')}\n}`;
      const result = checkRule(4, text);
      expect(result).toHaveLength(depth - 3);
      if (depth === 4) expect(result[0].line).toBe(5);
    }
  });

  it('else if の連鎖は同じ深さとし、その本体の入れ子は数える', () => {
    const chain = 'if (a) {} else if (b) {} else if (c) {} else if (d)';
    expect(checkRule(4, `${chain} { if (e) { if (f) {} } }`)).toHaveLength(0);
    expect(checkRule(4, `${chain} { if (e) { if (f) { if (g) {} } } }`)).toHaveLength(1);
    expect(checkRule(4, 'if (a) { if (b) { if (c) {} else { if (d) {} } } }')).toHaveLength(1);
  });

  it('関数の境界で深さをリセットする', () => {
    const text = 'if (a) { for (;;) { while (b) { const inner = () => { if (c) { if (d) { if (e) {} } } }; } } }';
    expect(checkRule(4, text)).toHaveLength(0);
  });

  it('switch の case と catch / finally 自体は深さに加えない', () => {
    expect(checkRule(4, 'switch (x) { case 1: if (a) { if (b) {} } break; }')).toHaveLength(0);
    expect(checkRule(4, 'try {} catch (error) { if (a) { if (b) {} } } finally { if (a) {} }')).toHaveLength(0);
  });
});

describe('規約 5: 三項演算子の入れ子', () => {
  it.each(['(a ? b : c) ? d : e', 'a ? ((b ? c : d)) : e', 'a ? b : (c ? d : e)'])(
    '条件・真・偽それぞれの直接の入れ子を検出する（%s）', (expression) => {
      expect(checkRule(5, `const value = ${expression};`)).toHaveLength(1);
    },
  );
  it('単独と関数呼び出し内の式は直接の入れ子にしない', () => {
    expect(checkRule(5, 'const value = a ? b : c;')).toHaveLength(0);
    expect(checkRule(5, 'const value = a ? call(b ? c : d) : e;')).toHaveLength(0);
  });
});

describe('規約 6: JSX 属性の処理', () => {
  it.each(['() =>', 'function ()'])( '2 文以上のブロック本体を検出する（%s）', (start) => {
    expect(checkRule(6, `<button onClick={${start} { a(); b(); }} />`, 'src/Test.tsx')).toHaveLength(1);
    expect(checkRule(6, `<button onClick={${start} { a(); }} />`, 'src/Test.tsx')).toHaveLength(0);
  });
  it('式本体・参照・空ブロック・JSX 本文は対象にしない', () => {
    const text = '<div><button onClick={() => a()} onFocus={handler} onBlur={() => {}} />{() => { a(); b(); }}</div>';
    expect(checkRule(6, text, 'src/Test.tsx')).toHaveLength(0);
  });
  it('括弧付き属性の関数も検査する', () => {
    expect(checkRule(6, '<button onClick={(() => { a(); b(); })} />', 'src/Test.tsx')).toHaveLength(1);
  });
});

describe('規約 7: エクスポートの説明コメント', () => {
  it.each([
    'export function example() {}', 'export async function example() {}',
    'export default function () {}', 'export default function example() {}',
    'export class Example {}', 'export default class Example {}',
    'export interface Example {}', 'export type Example = string;',
    'export enum Example { A }', 'export const example = 1;', 'export let example = 1;',
    'export var example = 1;', 'export const a = 1, b = 2;',
  ])('宣言の直前の JSDoc を要求する（%s）', (declaration) => {
    expect(checkRule(7, declaration)).toHaveLength(1);
    expect(checkRule(7, `/** 説明。 */\n${declaration}`)).toHaveLength(0);
    expect(checkRule(7, `// 説明。\n${declaration}`)).toHaveLength(1);
    expect(checkRule(7, `/* 説明。 */\n${declaration}`)).toHaveLength(1);
  });

  it('別の宣言や別のコメントに付いた JSDoc を流用しない', () => {
    expect(checkRule(7, '/** 説明。 */\nconst local = 1;\nexport const value = 1;')).toHaveLength(1);
    expect(checkRule(7, '/** 説明。 */\n// 別のコメント\nexport const value = 1;')).toHaveLength(1);
    expect(checkRule(7, '// 補足\n/** 説明。 */\nexport const value = 1;')).toHaveLength(0);
  });

  it('再エクスポートや既存識別子の export は検査しない', () => {
    expect(checkRule(7, "export { a } from './a';\nexport * from './b';\nexport { b };\nexport default b;\nconst local = 1;")).toHaveLength(0);
  });

  it.each(['src/example.d.ts', 'scripts/example.d.mts'])('宣言ファイルは規約 7 だけを免除する（%s）', (file) => {
    const text = `export declare const ${'a'.repeat(101)}: string;`;
    expect(checkRule(7, text, file)).toHaveLength(0);
    expect(checkRule(1, text, file)).toHaveLength(1);
  });
});

describe('出力と CLI', () => {
  it('パスを / に揃え、同じファイルの結果を行番号順にする', () => {
    const result = checkSource('src\\example.ts', `export const a = 1;\n${'a'.repeat(101)}`);
    expect(result.map(({ file, line, rule }) => ({ file, line, rule }))).toEqual([
      { file: 'src/example.ts', line: 1, rule: 7 }, { file: 'src/example.ts', line: 2, rule: 1 },
    ]);
  });

  it('import だけでは CLI を実行しない', () => {
    const url = new URL('../scripts/check-style.mjs', import.meta.url).href;
    expect(execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)})`],
      { encoding: 'utf8', cwd: temporaryRoot })).toBe('');
  });

  it('既定の src と scripts を検査し、ファイル名順に出力して終了コード 1 を返す', () => {
    const result = runCli({
      'src/z.ts': '\nexport const z = 1;', 'src/a.ts': 'export const a = 1;',
      'scripts/check.mjs': 'export const b = 1;', 'outside/ignored.ts': 'export const c = 1;',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(result.stdout.split('\n').filter((line) => /:\d+: \[/u.test(line))).toEqual([
      'scripts/check.mjs:1: [7] エクスポートする宣言の直前に JSDoc がありません',
      'src/a.ts:1: [7] エクスポートする宣言の直前に JSDoc がありません',
      'src/z.ts:2: [7] エクスポートする宣言の直前に JSDoc がありません',
    ]);
    expect(result.stdout).toContain('規則別件数: [1] 0 / [2] 0 / [3] 0 / [4] 0 / [5] 0 / [6] 0 / [7] 3');
    expect(result.stdout).toContain('合計: 3 件');
  });

  it('ディレクトリとファイルを指定でき、重複を数えない', () => {
    const result = runCli({
      'src/domain/a.ts': 'export const a = 1;', 'src/state/b.ts': 'export const b = 1;',
      'src/ui/c.ts': 'export const c = 1;',
    }, ['src/domain', 'src/state/b.ts', 'src/domain/a.ts']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('合計: 2 件');
    expect(result.stdout).not.toContain('src/ui');
  });

  it('拡張子を絞り、除外ディレクトリは直接指定でも検査しない', () => {
    const files: Record<string, string> = {};
    for (const extension of ['ts', 'tsx', 'js', 'mjs', 'd.ts', 'd.mts', 'json', 'css', 'mts']) {
      files[`src/a.${extension}`] = 'a'.repeat(101);
    }
    for (const directory of ['test', 'node_modules', 'dist', 'public']) {
      files[`${directory}/a.ts`] = 'export const a = 1;';
      files[`src/${directory}/a.ts`] = 'export const a = 1;';
    }
    const result = runCli(files, ['.', 'test/a.ts', 'node_modules', 'dist/a.ts', 'public']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('合計: 6 件');
    expect(result.stdout).not.toContain('[7] エクスポート');
  });

  it('違反なしなら日本語メッセージと 0 件を出して終了コード 0 を返す', () => {
    const result = runCli({ 'src/a.ts': '/** 説明。 */\nexport const a = 1;', 'scripts/a.mjs': '' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('違反はありません');
    expect(result.stdout).toContain('合計: 0 件');
  });

  it('--summary はトップレベルのディレクトリ別・規則別の件数だけを出す', () => {
    const result = runCli({
      'src/domain/a.ts': 'export const a = 1;', 'scripts/b.mjs': 'a'.repeat(101),
    }, ['--summary']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('scripts | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1');
    expect(result.stdout).toContain('src | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1');
    expect(result.stdout).toContain('合計: 2 件');
    expect(result.stdout).not.toMatch(/:\d+: \[/u);
  });

  it('存在しないパスを成功として扱わない', () => {
    const result = runCli({}, ['missing']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('可読性チェックに失敗しました:');
    expect(result.stdout).not.toContain('違反はありません');
  });
});
