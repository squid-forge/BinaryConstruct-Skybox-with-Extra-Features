import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const output = new URL('../Research/2026-10-22-streaming-export/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', async (dialog) => { errors.push(dialog.message()); await dialog.accept(); });
  for (const preset of ['gargantua', 'plasma-reef']) {
    await page.goto(`http://localhost:4189/?preset=${preset}`); await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByLabel('Resolution', { exact: true }).selectOption('512');
    await page.locator('#export-faces').uncheck();
    const ready = page.waitForEvent('download', { timeout: 120000 });
    await page.locator('.export-go').click();
    const download = await ready;
    const path = new URL(`${preset}-streamed.png`, output);
    await download.saveAs(fileURLToPath(path));
    const bytes = await readFile(path);
    if (bytes.readUInt32BE(16) !== 1024 || bytes.readUInt32BE(20) !== 512) throw new Error('Incorrect panorama size');
    await page.screenshot({ path: fileURLToPath(new URL(`${preset}-viewport.png`, output)) });
    results.push({ preset, bytes: bytes.length });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(new URL('special-cases.json', output), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }));
} finally { await browser.close(); }
