import { mkdir, writeFile } from 'node:fs/promises';

async function download() {
  const response = await fetch('https://dawnbrandbots.github.io/yaml-yugi/cards.json');
  if (!response.ok) {
    console.error(`カードデータの取得に失敗しました（HTTP ${response.status}）`);
    process.exitCode = 1;
    return;
  }
  const data = new Uint8Array(await response.arrayBuffer());
  await mkdir('data-src', { recursive: true });
  await writeFile('data-src/cards.json', data);
  console.log(`data-src/cards.json に ${data.byteLength} バイト保存しました`);
}

download().catch((error) => {
  console.error('カードデータの取得に失敗しました:', error.message);
  process.exitCode = 1;
});
