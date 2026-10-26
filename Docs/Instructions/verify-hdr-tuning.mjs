// Local integration fixture is optional and never packaged or tracked.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto('http://127.0.0.1:4189/?preset=nebula-jets');
  await page.waitForFunction(() => window.__preview?.layerObjects.length > 0);
  if (existsSync('PersonalTemplate.zip')) {
    await page.locator('input[type=file]').first().setInputFiles('PersonalTemplate.zip');
    await page.waitForFunction(() => window.__preview.previewLayers.some(l => l.name === 'galactic band'));
    await page.waitForTimeout(2000);
  }
  await page.getByRole('button', { name: 'Tune HDR', exact: true }).click();
  const panel = page.getByRole('region', { name: 'HDR tuning', exact: true });
  await panel.waitFor();
  await page.waitForFunction(() => window.__preview.hdrDisplay?.target);
  const result = await page.evaluate(async () => {
    const scene = window.__preview;
    await Promise.all(scene.layerObjects.map(o => o.ready));
    const ids = scene.layerObjects.map(o => o.group.uuid);
    const bh = scene.previewLayers.findIndex(l => l.type === 'blackhole');
    const original = scene.previewLayers[bh];
    scene.updateLayer(bh, { ...original, hdrMultiplier: 0 });
    if (scene.layerObjects[bh].group.uuid !== ids[bh]) throw Error('Black-hole HDR rebuilt geometry');
    const lens = scene.layerObjects[bh].group.children[0].material;
    if (lens.uniforms.hdrMultiplierAmt.value !== 0) throw Error('Black-hole HDR did not update');
    scene.updateLayer(bh, original);
    const points = scene.previewLayers.findIndex(l => l.type === 'points');
    scene.updateLayer(points, { ...scene.previewLayers[points], hdrMultiplier: 0 });
    if (scene.layerObjects[points].group.uuid !== ids[points]) throw Error('Star HDR rebuilt geometry');
    const p = scene.layerObjects[points].group.children[0].material;
    if (p.uniforms.layerHdrMultiplier.value !== 0) throw Error('Star HDR did not update');
    // Same builder in the export path, including sample-template imported assets.
    const source = await scene.createTileSource(scene.previewLayers.filter(l => l.visible !== false), 512);
    try {
      const tile = source.render(0, 0, 0);
      if (!tile.some(v => v > 0)) throw Error('Empty HDR export tile');
    } finally { source.dispose(); }
    const { defaultLayer } = await import('/src/core/layers.ts');
    const { defaultNebulaCloud } = await import('/src/core/nebulaCloud.ts');
    const { halfToFloat } = await import('/src/export/hdr.ts');
    const energy = async layer => {
      const source = await scene.createTileSource([layer], 512);
      try {
        const tile = source.render(5, 128, 128);
        let sum = 0;
        for (let i = 0; i < tile.length; i++) if (i % 4 !== 3) {
          const value = halfToFloat(tile[i]);
          if (!Number.isFinite(value)) throw Error(`${layer.type} produced invalid radiance`);
          sum += Math.abs(value);
        }
        return sum;
      } finally { source.dispose(); }
    };
    const radiance = {};
    for (const type of ['points', 'billboards', 'galaxy', 'sprite', 'noise', 'cloud', 'volumetric', 'sun', 'planet', 'blackhole']) {
      const layer = { ...(type === 'cloud' ? defaultNebulaCloud(0, 0) : defaultLayer(type)), dirLonDeg: 0, dirLatDeg: 0, hdrPower: 1, hdrMultiplier: 2 };
      if (type === 'sprite') layer.locked = true;
      if (type === 'sprite' || type === 'billboards') layer.texture = 'proc:point';
      const bright = await energy(layer), dark = await energy({ ...layer, hdrMultiplier: 0 });
      if (!(bright > 0 && dark === 0)) throw Error(`${type} HDR did not change export radiance: ${bright} / ${dark}`);
      radiance[type] = { bright, dark };
    }
    const noise = { ...defaultLayer('noise'), sourceBlendFactor: 'src_alpha', destBlendFactor: 'zero', hdrMultiplier: 1 };
    const unit = await energy(noise), scaled = await energy({ ...noise, hdrMultiplier: 3 });
    if (Math.abs(scaled / unit - 3) > 0.01) throw Error('HDR multiplier changed noise coverage');
    return { layers: ids.length, blackHoleIndex: bh, geometryReused: true, exportTileRendered: true, radiance, noiseCoverageGain: scaled / unit };
  });
  await panel.getByLabel('HDR item', { exact: true }).selectOption(String(result.blackHoleIndex));
  await panel.getByLabel('Item HDR multiplier value', { exact: true }).fill('3');
  await page.waitForFunction(i => window.__preview.previewLayers[i].hdrMultiplier === 3, result.blackHoleIndex);
  await panel.getByLabel('Display exposure (EV) value', { exact: true }).fill('-3');
  await page.waitForFunction(() => window.__preview.displayExposure.value === 0.125);
  await page.getByLabel('Viewport projection', { exact: true }).selectOption('2d');
  await page.waitForFunction(() => window.__preview.flatResources && !window.__preview.flatDirty);
  await panel.getByLabel('Display mapping', { exact: true }).selectOption('linear');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.local-review/hdr-tuning.png' });
  await panel.getByRole('button', { name: 'Done tuning' }).click();
  await page.waitForFunction(() => !window.__preview.hdrDisplay);
  if (errors.length) throw Error(errors.join('\n'));
  console.log(JSON.stringify({ ...result, errors, checks: ['template import', 'HDR uniform edits', 'linear export tile', 'display exposure', 'panorama mapping', 'display cleanup'] }, null, 2));
} finally { await browser.close(); }
