import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const LIMITS = { line: 100, literal: 40, function: 50, file: 250, depth: 3, statements: 1 };
const RULES = [1, 2, 3, 4, 5, 6, 7];
const EXCLUDED = new Set(['test', 'node_modules', 'dist', 'public']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const FUNCTION_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.FunctionExpression, ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration, ts.SyntaxKind.GetAccessor, ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.Constructor,
]);
const CONTROL_KINDS = new Set([
  ts.SyntaxKind.IfStatement, ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement, ts.SyntaxKind.WhileStatement, ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.SwitchStatement, ts.SyntaxKind.TryStatement,
]);
const EXPORT_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.InterfaceDeclaration, ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration, ts.SyntaxKind.VariableStatement,
]);
const LITERAL_KINDS = new Set([
  ts.SyntaxKind.StringLiteral, ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail,
]);

function normalizePath(fileName) {
  return fileName.replaceAll('\\', '/');
}

function unwrapParentheses(node) {
  while (node && ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

function getLine(source, position) {
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

function collectLiteralLines(source) {
  const lines = new Set();
  function visit(node) {
    if (LITERAL_KINDS.has(node.kind) && [...node.getText(source)].length >= LIMITS.literal) {
      const first = getLine(source, node.getStart(source));
      const last = getLine(source, node.end - 1);
      for (let line = first; line <= last; line++) lines.add(line);
    }
    for (const child of node.getChildren(source)) visit(child);
  }
  visit(source);
  return lines;
}

function countFunctionLines(node, source) {
  const body = node.body;
  const isBlock = ts.isBlock(body);
  const first = getLine(source, body.getStart(source)) + Number(isBlock);
  const last = getLine(source, body.end - 1) - Number(isBlock);
  const excluded = new Set();
  function visit(child) {
    if (FUNCTION_KINDS.has(child.kind)) {
      const start = Math.max(first, getLine(source, child.getStart(source)));
      const end = Math.min(last, getLine(source, child.end - 1));
      for (let line = start; line <= end; line++) excluded.add(line);
      return;
    }
    ts.forEachChild(child, visit);
  }
  // 内側の関数全体を除き、その中の関数を二重に差し引かない。
  visit(body);
  return Math.max(0, last - first + 1 - excluded.size);
}

function getFunctionName(node, source) {
  if (node.name) return node.name.getText(source).replace(/\s+/gu, ' ');
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (ts.isVariableDeclaration(node.parent)) return node.parent.name.getText(source);
  return '（無名）';
}

function getBookmarkletWrapper(fileName, source) {
  if (!/(^|\/)src\/importer\/bookmarklet\.src\.js$/u.test(fileName)) return undefined;
  if (source.statements.length !== 1) return undefined;
  const statement = source.statements[0];
  if (!ts.isExpressionStatement(statement)) return undefined;
  const expression = unwrapParentheses(statement.expression);
  if (ts.isFunctionExpression(expression)) return expression;
  return undefined;
}

function hasImmediateJsDoc(node, source) {
  const comments = ts.getLeadingCommentRanges(source.text, node.getFullStart()) ?? [];
  const last = comments.at(-1);
  return Boolean(last && source.text.slice(last.pos, last.pos + 3) === '/**'
    && source.text.slice(last.end, node.getStart(source)).trim() === '');
}

function checkNodeRules(node, source, add) {
  if (ts.isConditionalExpression(node)) {
    const parts = [node.condition, node.whenTrue, node.whenFalse];
    if (parts.some((part) => ts.isConditionalExpression(unwrapParentheses(part)))) {
      add(node, 5, '三項演算子が入れ子になっています');
    }
  }
  if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer)) {
    const value = unwrapParentheses(node.initializer.expression);
    const isFunction = value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value));
    if (isFunction && ts.isBlock(value.body) && value.body.statements.length > LIMITS.statements) {
      add(node, 6, 'JSX 属性の関数本体に 2 文以上あります。名前付きのハンドラにしてください');
    }
  }
  const isExported = node.modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword);
  if (!source.isDeclarationFile && EXPORT_KINDS.has(node.kind) && isExported) {
    if (!hasImmediateJsDoc(node, source)) add(node, 7, 'エクスポートする宣言の直前に JSDoc がありません');
  }
}

/** ソース文字列から可読性の規約 1〜7 の違反を行番号順に返す。 */
export function checkSource(fileName, text) {
  const file = normalizePath(fileName);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const violations = [];
  const lines = text.split(/\r\n|\n|\r/u);
  if (lines.at(-1) === '') lines.pop();
  const literalLines = collectLiteralLines(source);
  const wrapper = getBookmarkletWrapper(file, source);
  const add = (node, rule, message) => {
    violations.push({ file, line: getLine(source, node.getStart(source)), rule, message });
  };
  lines.forEach((line, index) => {
    const length = [...line].length;
    if (length > LIMITS.line && !literalLines.has(index + 1)) {
      violations.push({ file, line: index + 1, rule: 1,
        message: `行が ${length} 文字あります。上限 ${LIMITS.line} 文字` });
    }
  });
  if (lines.length > LIMITS.file) {
    violations.push({ file, line: 1, rule: 3,
      message: `ファイルが ${lines.length} 行あります。上限 ${LIMITS.file} 行` });
  }
  function visit(node, depth) {
    if (FUNCTION_KINDS.has(node.kind)) {
      depth = 0;
      const length = node.body ? countFunctionLines(node, source) : 0;
      if (node !== wrapper && length > LIMITS.function) {
        const name = getFunctionName(node, source);
        add(node, 2, `関数 ${name} の本体が ${length} 行（内側の関数を除く）。上限 50 行`);
      }
    }
    if (CONTROL_KINDS.has(node.kind)) {
      const isElseIf = ts.isIfStatement(node) && ts.isIfStatement(node.parent)
        && node.parent.elseStatement === node;
      if (!isElseIf) depth++;
      if (depth > LIMITS.depth) add(node, 4, `制御構文の入れ子が ${depth} 段あります。上限 3 段`);
    }
    checkNodeRules(node, source, add);
    ts.forEachChild(node, (child) => visit(child, depth));
  }
  visit(source, 0);
  return violations.sort((left, right) => left.line - right.line || left.rule - right.rule);
}

async function collectFiles(target, files) {
  const absolute = path.resolve(target);
  if (normalizePath(absolute).split('/').some((part) => EXCLUDED.has(part))) return;
  const info = await stat(absolute);
  if (info.isDirectory()) {
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isFile()) {
        await collectFiles(path.join(absolute, entry.name), files);
      }
    }
  } else if (EXTENSIONS.has(path.extname(absolute)) || absolute.endsWith('.d.mts')) {
    files.add(absolute);
  }
}

function printSummary(violations, hasDirectoryTable) {
  if (hasDirectoryTable) {
    const directories = new Map();
    for (const violation of violations) {
      const parts = violation.file.split('/');
      const directory = parts.length > 1 ? parts[0] : '.';
      if (!directories.has(directory)) directories.set(directory, RULES.map(() => 0));
      directories.get(directory)[violation.rule - 1]++;
    }
    console.log('ディレクトリ | 規則1 | 規則2 | 規則3 | 規則4 | 規則5 | 規則6 | 規則7 | 合計');
    for (const [directory, counts] of [...directories].sort()) {
      const total = counts.reduce((sum, count) => sum + count, 0);
      console.log(`${directory} | ${counts.join(' | ')} | ${total}`);
    }
  }
  const counts = RULES.map((rule) => violations.filter((item) => item.rule === rule).length);
  console.log(`規則別件数: ${counts.map((count, index) => `[${index + 1}] ${count}`).join(' / ')}`);
  console.log(`合計: ${violations.length} 件`);
}

async function runCli() {
  const args = process.argv.slice(2);
  const hasSummary = args.includes('--summary');
  const targets = args.filter((arg) => arg !== '--summary');
  const files = new Set();
  for (const target of targets.length ? targets : ['src', 'scripts']) {
    await collectFiles(target, files);
  }
  const violations = [];
  const sorted = [...files].sort((left, right) => {
    const first = normalizePath(path.relative(process.cwd(), left));
    const second = normalizePath(path.relative(process.cwd(), right));
    if (first < second) return -1;
    if (first > second) return 1;
    return 0;
  });
  for (const file of sorted) {
    const text = await readFile(file, 'utf8');
    violations.push(...checkSource(path.relative(process.cwd(), file), text));
  }
  if (!hasSummary) {
    for (const item of violations) {
      console.log(`${item.file}:${item.line}: [${item.rule}] ${item.message}`);
    }
    if (!violations.length) console.log('違反はありません');
  }
  printSummary(violations, hasSummary);
  process.exitCode = violations.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(`可読性チェックに失敗しました: ${error.message}`);
    process.exitCode = 1;
  });
}
