import { describe, expect, it } from 'vitest';
import { formatAppVersion, readAppVersion } from '../scripts/appVersion.mjs';

describe('バージョンの表記', () => {
  it.each([
    ['v1.0.1\n', 'v1.0.1'],
    ['v1.0.1-0-gabc1234', 'v1.0.1'],
    ['v1.0.1-15-g324d8f3\n', 'v1.0.1+15'],
    ['v12.3.40-2-g0123456789', 'v12.3.40+2'],
  ])('git describe の %j を %s にする', (describe, expected) => {
    expect(formatAppVersion(describe, '9.9.9')).toBe(expected);
  });

  it.each(['', 'abc1234', 'v1.0', 'release-1', 'v1.0.1-dirty'])(
    '読み取れない %j は package.json のバージョンを使う', describe => {
      expect(formatAppVersion(describe, '1.0.1')).toBe('v1.0.1');
    },
  );

  it('このリポジトリのバージョンを画面の表記で返す', () => {
    expect(readAppVersion(process.cwd())).toMatch(/^v\d+\.\d+\.\d+(?:\+\d+)?$/u);
  });
});
