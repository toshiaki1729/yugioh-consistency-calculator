import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DESCRIBE_PATTERN = /^v(\d+\.\d+\.\d+)(?:-(\d+)-g[0-9a-f]+)?$/u;

/**
 * `git describe --tags` の出力を画面用の表記にする。
 * タグのコミットなら「v1.0.1」、その後のコミットなら「v1.0.1+3」（タグから 3 コミット後）。
 * タグが無いなど読み取れないときは、package.json のバージョンを使う。
 */
export function formatAppVersion(describe, packageVersion) {
  const match = DESCRIBE_PATTERN.exec(describe.trim());
  if (!match) return `v${packageVersion}`;
  return match[2] && match[2] !== '0' ? `v${match[1]}+${match[2]}` : `v${match[1]}`;
}

function describeHead(root) {
  try {
    return execFileSync('git', ['describe', '--tags', '--match', 'v*'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // git が無い・タグを取得していない環境では package.json のバージョンに任せる。
    return '';
  }
}

/** ビルドするコミットのバージョンを、画面に出す表記で返す。 */
export function readAppVersion(root) {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  return formatAppVersion(describeHead(root), packageJson.version);
}
