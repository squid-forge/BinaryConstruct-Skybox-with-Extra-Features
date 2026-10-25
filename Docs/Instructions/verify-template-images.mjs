import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8, unzipSync } from 'fflate';
const output = new URL('../Research/2026-10-22-template-images/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [], results = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('dialog', async (dialog) => { errors.push(dialog.message()); await dialog.accept(); });
const scene = (texture) => ({ version: 2, layers: [{ type: 'sprite', name: 'Saved PNG assignment', texture, dirLonDeg: 0, dirLatDeg: 0, apparentSize: 0.4, sourceBlendFactor: 'one', destBlendFactor: 'zero' }] });
async function open(name, bytes) {
  await page.locator('.file-row input[type=file]').setInputFiles({ name, mimeType: name.endsWith('.zip') ? 'application/zip' : 'application/json', buffer: Buffer.from(bytes) });
  await page.waitForTimeout(600);
}
async function assertVisible(label, reference) {
  const selected = await page.getByLabel('Texture', { exact: true }).inputValue();
  if (selected !== reference) throw new Error(`Assignment changed: ${selected} != ${reference}`);
  const ready = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const download = await ready;
  const stream = await download.createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const entries = unzipSync(Buffer.concat(chunks));
  const json = JSON.parse(new TextDecoder().decode(entries['project.json']));
  if (json.layers[0].texture !== reference) throw new Error('Save changed the assigned reference');
  const png = entries['preview.png'];
  const brightness = await page.evaluate(async (bytes) => {
    const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, image.width, image.height).data;
    let max = 0; for (let i = 0; i < rgba.length; i += 4) max = Math.max(max, rgba[i], rgba[i + 1], rgba[i + 2]);
    image.close(); return max;
  }, [...png]);
  if (brightness < 30) throw new Error(`${label}: assigned image is invisible`);
  await writeFile(new URL(`${label}-preview.png`, output), png);
  await page.screenshot({ path: fileURLToPath(new URL(`${label}.png`, output)) });
  results.push({ label, reference, selected, brightness });
  await page.waitForFunction(() => document.querySelector('.file-buttons button:nth-child(2)').disabled === false);
}
try {
  await page.goto('http://localhost:4189/'); await page.waitForTimeout(1500);
  const png = new Uint8Array(await readFile(new URL('../../public/media/textures/sun.png', import.meta.url)));
  const legacy = 'C:\\Spacescape\\textures\\FLARE-RED1.PNG';
  await open('legacy-path.json', strToU8(JSON.stringify(scene(legacy))));
  await assertVisible('legacy-path', legacy);
  const reference = 'planet.png';
  await open('embedded.zip', zipSync({ 'project.json': strToU8(JSON.stringify(scene(reference))), 'assets/planet.png': png }));
  await assertVisible('embedded-png', reference);
  // Replace a project with the same asset ID to exercise cache invalidation.
  const blue = new Uint8Array(await readFile(new URL('../../public/media/textures/flare-blue-purple1.png', import.meta.url)));
  await open('replacement.zip', zipSync({ 'project.json': strToU8(JSON.stringify(scene(reference))), 'assets/planet.png': blue }));
  await assertVisible('replacement-png', reference);
  await open('missing.zip', zipSync({ 'project.json': strToU8(JSON.stringify(scene('user:missing.png'))) }));
  if (await page.getByLabel('Texture', { exact: true }).inputValue() !== 'user:missing.png') throw new Error('Missing assignment cleared');
  if (!await page.getByRole('status').isVisible()) throw new Error('Missing image not reported');
  await page.screenshot({ path: fileURLToPath(new URL('missing-assignment.png', output)) });
  await page.getByRole('button', { name: 'Sprites', exact: true }).click();
  await page.locator('.asset-tab input[type=file]').setInputFiles({ name: 'missing.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await page.waitForTimeout(400);
  if (await page.getByRole('status').isVisible()) throw new Error('Uploaded file did not resolve');
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await assertVisible('relinked-png', 'user:missing.png');
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(new URL('verification.json', output), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally { await browser.close(); }
