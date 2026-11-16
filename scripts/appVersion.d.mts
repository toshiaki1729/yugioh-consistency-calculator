/** `git describe --tags` の出力を画面用の表記（例: v1.0.1、v1.0.1+3）にする。 */
export function formatAppVersion(describe: string, packageVersion: string): string;

/** ビルドするコミットのバージョンを、画面に出す表記で返す。 */
export function readAppVersion(root: string): string;
