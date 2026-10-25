// Build and serve dist on port 4189 first. Set HIGH_RES=1 to include full-size jobs.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { unzipSync, Unzip, Unzlib } from 'fflate';

const output = new URL('../Research/2026-10-22-streaming-export/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', args: ['--js-flags=--max-old-space-size=512'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 }, acceptDownloads: true });
const cdp = await page.context().newCDPSession(page);
const errors = [], dialogs = [], metrics = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
let stage = '';
let lastProgress = '';
const timer = setInterval(async () => {
  try {
    const heap = await cdp.send('Runtime.getHeapUsage');
    metrics.push({ stage, ...heap });
    const progress = await page.locator('.export-go').textContent().catch(() => '');
    if (progress && progress !== lastProgress && stage.startsWith('panorama-')) { console.log(progress); lastProgress = progress; }
  } catch {}
}, 1000);

async function openPanel() {
  if (!await page.locator('.export-panel').isVisible()) await page.getByRole('button', { name: 'Export', exact: true }).click();
}
async function configure(size, formats, saving = true) {
  await openPanel();
  await page.getByLabel('Resolution', { exact: true }).selectOption(String(size));
  if (!await page.getByLabel('Memory-saving export', { exact: true }).isDisabled()) await page.getByLabel('Memory-saving export', { exact: true }).setChecked(saving);
  for (const [id, value] of Object.entries({ faces: false, png: false, hdr: false, exr: false, 'per-layer': false, ...formats })) await page.locator(`#export-${id}`).setChecked(value);
  if (await page.getByLabel('HDR softness', { exact: true }).count()) await page.getByLabel('HDR softness', { exact: true }).fill('0');
  await page.locator('.export-panel input.num').fill('1');
}
async function run(name, expected) {
  stage = name;
  console.log(`Starting ${name}`);
  const downloads = [];
  const handler = (download) => {
    const filename = `${name}-${download.suggestedFilename()}`;
    downloads.push({ filename, done: download.saveAs(fileURLToPath(new URL(filename, output))) });
  };
  page.on('download', handler);
  const started = Date.now();
  await page.locator('.export-go').click();
  await page.waitForFunction(() => !document.querySelector('.export-go') || !document.querySelector('.export-go').disabled, undefined, { timeout: 1200000 });
  await page.waitForTimeout(200);
  page.off('download', handler);
  await Promise.all(downloads.map((d) => d.done));
  if (downloads.length !== expected) throw new Error(`${name}: expected ${expected} downloads, got ${downloads.length}: ${dialogs}`);
  if (dialogs.length || errors.length) throw new Error(JSON.stringify({ dialogs, errors }));
  console.log(`Finished ${name} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return downloads.map((d) => d.filename);
}

// Incremental PNG decode; retain only two scanlines and a thumbnail.
function thumbnail(png, maxWidth = 1024) {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), channels = png[25] === 2 ? 3 : 4;
  const step = Math.max(1, Math.ceil(width / maxWidth));
  const tw = Math.ceil(width / step), th = Math.ceil(height / step);
  const pixels = new Uint8Array(tw * th * 4), stride = width * channels;
  let previous = new Uint8Array(stride), pending = new Uint8Array(), row = 0;
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  const inflater = new Unzlib((chunk) => {
    const data = new Uint8Array(pending.length + chunk.length); data.set(pending); data.set(chunk, pending.length);
    let offset = 0;
    while (offset + stride + 1 <= data.length) {
      const filter = data[offset++], current = data.slice(offset, offset + stride); offset += stride;
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? current[x - channels] : 0, b = previous[x], c = x >= channels ? previous[x - channels] : 0;
        current[x] += filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? paeth(a, b, c) : 0;
      }
      if (row % step === 0) for (let x = 0; x < width; x += step) {
        const o = (Math.floor(row / step) * tw + Math.floor(x / step)) * 4;
        pixels.set([current[x * channels], current[x * channels + 1], current[x * channels + 2], 255], o);
      }
      previous = current; row++;
    }
    pending = data.slice(offset);
  });
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') inflater.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  inflater.push(new Uint8Array(), true);
  if (row !== height || pending.length) throw new Error('Incomplete PNG');
  return { width, height, tw, th, pixels };
}
async function saveThumbnail(filename) {
  const png = await readFile(new URL(filename, output));
  const image = thumbnail(png);
  const encoded = await page.evaluate(({ w, h, pixels }) => {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels), w, h), 0, 0);
    return canvas.toDataURL().split(',')[1];
  }, { w: image.tw, h: image.th, pixels: [...image.pixels] });
  await writeFile(new URL(`${filename}-thumbnail.png`, output), Buffer.from(encoded, 'base64'));
  return { width: image.width, height: image.height, bytes: png.length, hash: createHash('sha256').update(png).digest('hex') };
}

try {
  await page.goto('http://localhost:4189/'); await page.waitForTimeout(2500);
  await configure(512, { faces: true, png: true, hdr: true, exr: true });
  const streamed = await run('streamed', 4);
  // Legacy reference is an explicit small library bake; the app UI always streams.
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  const referenceLayers = JSON.parse(await page.locator('textarea.script-text').inputValue()).layers;
  const reference = await page.evaluate(async layers => {
    const { faces } = await window.__preview.bakeExport(layers, 512, false, false, true);
    return faces.map(data => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d'), image = ctx.createImageData(512, 512);
      for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
        const src = ((511 - y) * 512 + x) * 4, dst = (y * 512 + x) * 4;
        for (let c = 0; c < 3; c++) image.data[dst + c] = Math.round(Math.max(0, Math.min(1, data[src + c])) * 255);
        image.data[dst + 3] = 255;
      }
      ctx.putImageData(image, 0, 0); return canvas.toDataURL().split(',')[1];
    });
  }, referenceLayers);
  const newFaces = unzipSync(await readFile(new URL(streamed.find((f) => f.endsWith('.zip')), output)));
  const oldFaces = Object.fromEntries(Object.keys(newFaces).map((name, i) => [name, Buffer.from(reference[i], 'base64')]));
  const comparisons = [];
  for (const name of Object.keys(newFaces)) {
    const a = thumbnail(Buffer.from(newFaces[name]), 512).pixels, b = thumbnail(Buffer.from(oldFaces[name]), 512).pixels;
    let difference = 0, max = 0;
    for (let i = 0; i < a.length; i++) { difference += Math.abs(a[i] - b[i]); max = Math.max(max, Math.abs(a[i] - b[i])); }
    const mean = difference / a.length;
    comparisons.push({ name, mean, max });
    if (mean > 0.2) throw new Error(`Cube orientation/content mismatch ${name}: ${mean}`);
  }
  const preview = await saveThumbnail(streamed.find((f) => f.endsWith('.png')));
  await configure(512, { png: true });
  const repeat = await run('repeat', 1);
  const repeatPreview = await saveThumbnail(repeat[0]);
  if (repeatPreview.hash !== preview.hash) throw new Error('Non-deterministic streaming export');
  await configure(512, { png: true });
  await page.locator('.export-panel input.num').fill('2');
  const batch = await run('batch', 1);
  const batchFiles = Object.keys(unzipSync(await readFile(new URL(batch[0], output))));
  if (!batchFiles.includes('manifest.json') || batchFiles.length !== 3) throw new Error('Invalid batch archive');
  await configure(512, { png: true, 'per-layer': true });
  const layered = await run('layers', 1);
  const layerFiles = unzipSync(await readFile(new URL(layered[0], output)));
  if (!layerFiles['composite.json'] || !layerFiles['composite/equirect.png']) throw new Error('Invalid per-layer archive');
  await configure(8192, { faces: true });
  await page.locator('.export-go').click();
  await page.getByRole('button', { name: 'Cancel export', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.export-go').disabled);
  if (await page.getByRole('button', { name: 'Cancel export', exact: true }).isVisible()) throw new Error('Cancellation failed');
  const high = [];
  const highCube = [];
  if (process.env.HIGH_RES === '1') {
    for (const faceSize of [4096, 8192]) {
      await configure(faceSize, { png: true });
      const files = await run(`panorama-${faceSize * 2}`, 1);
      high.push(await saveThumbnail(files[0]));
      if (high.at(-1).width !== faceSize * 2 || high.at(-1).height !== faceSize) throw new Error('Incorrect high-resolution dimensions');
    }
  }
  if (process.env.HIGH_CUBE === '1') {
    await configure(16384, { faces: true });
    const [filename] = await run('cube-16384', 1);
    const unzip = new Unzip((file) => {
      let header = new Uint8Array(), bytes = 0;
      file.ondata = (error, data, final) => {
        if (error) throw error;
        bytes += data.length;
        if (header.length < 32) { const next = new Uint8Array(Math.min(32, header.length + data.length)); next.set(header); next.set(data.subarray(0, next.length - header.length), header.length); header = next; }
        if (final) {
          const view = new DataView(header.buffer);
          if (view.getUint32(16) !== 16384 || view.getUint32(20) !== 16384) throw new Error('Wrong cube face size');
          highCube.push({ name: file.name, bytes });
        }
      };
      file.start();
    });
    for await (const chunk of createReadStream(fileURLToPath(new URL(filename, output)))) unzip.push(chunk);
    unzip.push(new Uint8Array(), true);
    if (highCube.length !== 6) throw new Error('Incomplete cube archive');
  }
  await configure(8192, { png: true });
  await page.screenshot({ path: fileURLToPath(new URL('export-panel.png', output)) });
  const summary = { comparisons, preview, repeatPreview, batchFiles, layerFiles: Object.keys(layerFiles), high, highCube, errors, dialogs,
    peakHeapMiB: Math.max(...metrics.map((m) => m.usedSize)) / 1048576,
    peakBackingMiB: Math.max(...metrics.map((m) => m.backingStorageSize || 0)) / 1048576,
  };
  await writeFile(new URL('verification.json', output), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally { clearInterval(timer); await browser.close(); }
