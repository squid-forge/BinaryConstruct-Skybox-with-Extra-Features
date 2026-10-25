import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const output = new URL('../Research/2026-10-25-nebula-clouds/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1450, height: 960 }, acceptDownloads: true });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', async d => { errors.push(d.message()); await d.dismiss(); });
  await page.goto('http://localhost:4189/?preset=galactic-rim'); await page.waitForTimeout(2000);
  await page.getByRole('button', { name: '+cloud', exact: true }).click(); await page.waitForTimeout(1600);
  await page.screenshot({ path: fileURLToPath(new URL('cloud-first.png', output)) });
  const set = async (label, value) => { await page.getByLabel(label, { exact: true }).locator('..').locator('input[type=number]').fill(String(value)); await page.waitForTimeout(500); };
  const scene = async () => { await page.getByRole('button', { name: 'Script', exact: true }).click(); return JSON.parse(await page.locator('textarea.script-text').inputValue()); };
  const selectCloud = async name => { await page.getByRole('button', { name: 'Layers', exact: true }).click(); await page.locator('.layer-panel .layer-name').getByText(name, { exact: true }).click(); };
  const apply = async data => { await scene(); await page.locator('textarea.script-text').fill(JSON.stringify(data)); await page.getByRole('button', { name: 'Layers', exact: true }).click(); await page.waitForTimeout(1100); };
  const shot = name => page.screenshot({ path: fileURLToPath(new URL(name + '.png', output)) });
  const original = await scene(), cloud = original.layers.at(-1);
  await apply({ version: 2, layers: [cloud] }); await selectCloud(cloud.name); await shot('isolated-smoke-cloud');
  await writeFile(new URL('local-cloud-scene.json', output), JSON.stringify({ version: 2, layers: [cloud] }, null, 2));
  const masks = [];
  for (const name of ['puff', 'billow', 'wisps', 'burst', 'procedural']) {
    await page.getByLabel('Smoke mask', { exact: true }).selectOption(name); await page.waitForTimeout(650);
    masks.push(await page.locator('.viewport canvas').screenshot()); await shot(`mask-${name}`);
  }
  if (masks.some((bytes, i) => i > 0 && bytes.equals(masks[i - 1]))) throw Error('Different smoke masks produced identical output');
  for (const value of ['1', '2', '3', '0']) {
    await page.getByLabel('Smoke pattern', { exact: true }).selectOption(value); await page.waitForTimeout(400); await shot(`pattern-${value}`);
  }
  await page.getByLabel('Smoke mask', { exact: true }).selectOption('billow'); await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Stack radial cloud', exact: true }).click();
  await set('Radial inner cavity', 0.3); await set('Light source size', 0.035);
  await page.getByRole('button', { name: 'Center main light', exact: true }).click();
  const radial = await scene();
  if (radial.layers[0].cloudInnerRadius || radial.layers[1].cloudInnerRadius !== 0.3 || radial.layers[1].cloudLightRadius !== 0.035 || radial.layers[0].apparentSize === radial.layers[1].apparentSize) throw Error('Radial stack controls are coupled');
  await selectCloud(radial.layers[1].name); await shot('radial-stack-light-size');
  await apply({ version: 2, layers: [cloud] }); await selectCloud(cloud.name);
  const lit = await page.locator('.viewport canvas').screenshot();
  await set('Self shadow', 0); const unshadowed = await page.locator('.viewport canvas').screenshot();
  if (lit.equals(unshadowed)) throw Error('Self shadows made no rendering difference');
  await shot('self-shadow-off'); await set('Self shadow', 5); await set('Light 1 depth', 0.12); await set('Light shafts', 3); await shot('shadow-shafts');
  await page.getByRole('button', { name: 'Stack this nebula', exact: true }).click();
  await set('Cloud size', 0.28); await set('Smoke density', 1.2); await set('Light 1 power', 8);
  await page.getByLabel('Smoke mask', { exact: true }).selectOption('wisps');
  const stacked = await scene();
  if (stacked.layers.length !== 2 || stacked.layers[0].apparentSize !== cloud.apparentSize || stacked.layers[1].apparentSize !== 0.28 || stacked.layers[0].cloudMask === 'wisps' || stacked.layers[0].cloudLightPower === 8 || stacked.layers[0].seed === stacked.layers[1].seed) throw Error('Stacked cloud settings are coupled');
  await selectCloud(stacked.layers[1].name); await shot('individual-stack-controls');
  await page.getByLabel('Nebula stack', { exact: true }).selectOption('0');
  if (await page.getByLabel('Smoke mask', { exact: true }).inputValue() !== 'billow') throw Error('Stack selector did not restore original controls');
  // Undo/redo visibility and field edits. Clicking the title takes keyboard focus out of controls.
  await page.getByRole('button', { name: `Hide ${cloud.name}`, exact: true }).click(); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  if ((await page.getByRole('button', { name: `Show ${cloud.name}`, exact: true }).count()) > 0) throw Error('Undo did not restore layer visibility');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  if (await page.getByRole('button', { name: `Show ${cloud.name}`, exact: true }).count() === 0) throw Error('Redo did not restore hidden layer');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await set('Cloud size', 0.72); await page.getByRole('button', { name: 'Undo', exact: true }).click();
  if (await page.getByLabel('Cloud size', { exact: true }).locator('..').locator('input[type=number]').inputValue() !== String(cloud.apparentSize)) throw Error('Undo did not restore cloud size');
  const rows = page.locator('.layer-panel li');
  await rows.nth(0).dragTo(rows.nth(1)); await page.waitForTimeout(500);
  const reordered = await scene(); if (reordered.layers[0].name !== stacked.layers[1].name) throw Error('Drag/drop did not reorder layers');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const restoredOrder = await scene(); if (restoredOrder.layers[0].name !== cloud.name) throw Error('Undo did not restore layer order');
  await selectCloud(cloud.name);
  await page.locator('.layer-panel li').first().getByTitle('Delete', { exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  if ((await scene()).layers.length !== 2) throw Error('Undo did not recover a deleted layer');
  await apply({ version: 2, layers: [cloud] }); await selectCloud(cloud.name);
  // Drag the actual cloud, not its row, and check scene coordinates.
  const box = await page.locator('.viewport canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 - 30, { steps: 6 }); await page.mouse.up();
  const moved = await scene(); if (moved.layers[0].dirLonDeg === cloud.dirLonDeg && moved.layers[0].dirLatDeg === cloud.dirLatDeg) throw Error('Cloud viewport drag did not commit');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await selectCloud(cloud.name); await shot('cloud-drag-undone');
  await set('Cloud size', 0.61); await page.keyboard.press('Control+z');
  if (await page.getByLabel('Cloud size', { exact: true }).locator('..').locator('input[type=number]').inputValue() !== String(cloud.apparentSize)) throw Error('Keyboard undo failed from numeric control');
  await page.keyboard.press('Control+Shift+z');
  if (await page.getByLabel('Cloud size', { exact: true }).locator('..').locator('input[type=number]').inputValue() !== '0.61') throw Error('Keyboard redo failed');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Resolution', { exact: true }).selectOption('512');
  await page.locator('#export-faces').uncheck(); await page.locator('#export-png').check();
  const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
  await page.locator('.export-go').click();
  const download = await downloadPromise; await download.saveAs(fileURLToPath(new URL('cloud-export.png', output)));
  await page.waitForFunction(() => !document.querySelector('.export-panel'), undefined, { timeout: 120000 });
  const highResolution = await page.evaluate(async cloud => {
    const results = [];
    for (const size of [8192, 16384]) {
      const source = await window.__preview.createTileSource([cloud], size);
      try {
        const data = source.render(5, size / 2, size / 2);
        let nonzero = 0;
        for (let i = 0; i < data.length; i += 4) {
          if ((data[i] & 0x7c00) === 0x7c00 || (data[i + 1] & 0x7c00) === 0x7c00 || (data[i + 2] & 0x7c00) === 0x7c00) throw Error('Nonfinite cloud radiance');
          if (data[i] || data[i + 1] || data[i + 2]) nonzero++;
        }
        results.push({ size, tileSize: source.tileSize, nonzero });
      } finally { source.dispose(); }
    }
    return results;
  }, cloud);
  if (highResolution.some(r => r.nonzero === 0)) throw Error('Cloud is absent from high-resolution tile source');
  // Shared controls render on an all-sky band and on native stacked jets.
  await apply({ version: 2, layers: [{ ...original.layers[0], smokeEnabled: true, cloudMask: 'puff', cloudShadow: 0, previewTextureSize: 128 }] }); await shot('band-with-smoke');
  await page.getByRole('button', { name: '+b.hole', exact: true }).click();
  await page.getByLabel('Smoke shaping and lighting', { exact: true }).check();
  await page.getByLabel('Smoke mask', { exact: true }).selectOption('wisps'); await page.waitForTimeout(1000); await shot('native-smoke-jets');
  await page.getByRole('button', { name: '+volume', exact: true }).click();
  const volumeScene = await scene(), volume = volumeScene.layers.at(-1);
  await apply({ version: 2, layers: [{ ...volume, smokeEnabled: true, cloudMask: 'burst', steps: 8, previewTextureSize: 64 }] });
  await shot('volume-smoke');
  // PCG nebula and plume bakes use the same bundled masks with a CPU field.
  await page.getByRole('button', { name: 'PCG', exact: true }).click();
  await page.getByLabel('Type', { exact: true }).selectOption('nebula');
  await page.getByLabel('Smoke shaping and lighting', { exact: true }).check();
  await page.getByLabel('Smoke mask', { exact: true }).selectOption('puff'); await page.waitForTimeout(1200); await shot('pcg-nebula-smoke');
  await page.getByLabel('Type', { exact: true }).selectOption('anomaly');
  await page.getByLabel('Style', { exact: true }).selectOption('nebula-plumes');
  await page.getByLabel('Smoke shaping and lighting', { exact: true }).check();
  await page.getByLabel('Smoke mask', { exact: true }).selectOption('billow'); await page.waitForTimeout(1200); await shot('pcg-plumes-smoke');
  await page.getByLabel('Type', { exact: true }).selectOption('pcg');
  const corona = page.locator('summary').filter({ hasText: /^Corona streamers/ }).locator('..');
  await corona.getByLabel('Smoke shaping and lighting', { exact: true }).check();
  await corona.getByLabel('Smoke mask', { exact: true }).selectOption('wisps'); await page.waitForTimeout(1200); await shot('pcg-component-smoke');
  await page.getByRole('button', { name: 'Sprites', exact: true }).click();
  const upload = page.locator('.asset-tab input[type=file]');
  await upload.setInputFiles({ name: 'undo-mask.png', mimeType: 'image/png', buffer: await readFile('public/masks/smoke/billow.png') });
  await page.getByRole('img', { name: 'undo-mask.png', exact: true }).waitFor();
  await page.getByRole('img', { name: 'undo-mask.png', exact: true }).locator('..').getByTitle('Remove sprite', { exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('img', { name: 'undo-mask.png', exact: true }).waitFor();
  const widthBefore = await page.getByRole('img', { name: 'undo-mask.png', exact: true }).evaluate(async img => { await img.decode(); return img.naturalWidth; });
  await upload.setInputFiles({ name: 'undo-mask.png', mimeType: 'image/png', buffer: await readFile('public/masks/smoke/puff.png') });
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const widthAfter = await page.getByRole('img', { name: 'undo-mask.png', exact: true }).evaluate(async img => { await img.decode(); return img.naturalWidth; });
  if (widthAfter !== widthBefore) throw Error('Undo did not restore replaced asset bytes');
  await page.goto('http://localhost:4189/?preset=smoke-clouds'); await page.waitForTimeout(1500); await shot('smoke-clouds-preset');
  const stats = await page.evaluate(async () => {
    const image = new Image(); image.src = './masks/smoke/billow.png'; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const d = ctx.getImageData(0, 0, image.width, image.height).data;
    let min = 255, max = 0; for (let i = 3; i < d.length; i += 4) { min = Math.min(min, d[i]); max = Math.max(max, d[i]); }
    return { width: image.width, height: image.height, minAlpha: min, maxAlpha: max };
  });
  await writeFile(new URL('first-results.json', output), JSON.stringify({ errors, stats, highResolution, checks: ['five masks', 'four smoke patterns', 'self shadows', 'shafts', 'independent stack controls', 'independent radial layers and light size', 'visibility undo redo', 'parameter undo', 'keyboard undo redo', 'drag reorder undo', 'delete undo', 'cloud drag undo', 'asset removal and replacement undo', 'PNG export', 'native 8K and 16K tiles', 'band smoke', 'volume smoke', 'native jet smoke', 'PCG nebula and plume smoke', 'PCG component smoke', 'smoke-clouds preset'] }, null, 2));
  if (errors.length) throw Error(errors.join('\n'));
  console.log('First local cloud rendered', stats);
} finally { await browser.close(); }
