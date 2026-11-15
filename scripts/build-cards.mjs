import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { convertCards } from './convertCards.mjs';

const [input = 'data-src/cards.json', output = 'public/data/cards.ja.json'] = process.argv.slice(2);

async function build() {
  let raw = JSON.parse(await readFile(input, 'utf8'));
  if (!Array.isArray(raw)) {
    console.error('カードデータの入力は配列である必要があります');
    process.exitCode = 1;
    return;
  }
  const { db, stats } = convertCards(raw, new Date().toISOString());
  raw = undefined;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(db), 'utf8');
  console.log(`変換 ${stats.converted} 件 / 除外 ${stats.skipped} 件 / 警告 ${stats.warnings} 件`);
  for (const [warning, count] of Object.entries(stats.warningCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`${warning}: ${count} 件`);
  }
}

build().catch((error) => {
  console.error('カードDBの生成に失敗しました:', error.message);
  process.exitCode = 1;
});
