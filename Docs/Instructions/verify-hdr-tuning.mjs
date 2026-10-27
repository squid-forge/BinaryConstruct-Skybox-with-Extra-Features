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
  const panel = page.locator('.inspector');
  await panel.waitFor();
  if (await page.getByRole('button', { name: 'Tune HDR', exact: true }).count()) throw Error('Separate tuning mode still exists');
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
    scene.updateLayer(points, { ...scene.previewLayers[points], hdrMultiplier: undefined });
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
  await panel.getByLabel('Selected item', { exact: true }).selectOption(String(result.blackHoleIndex));
  const beforeShape = await page.evaluate(i => {
    const { hdrMultiplier: _gain, ...shape } = window.__preview.previewLayers[i]; return JSON.stringify(shape);
  }, result.blackHoleIndex);
  await panel.getByLabel('Brightness value', { exact: true }).fill('3');
  await page.waitForFunction(i => window.__preview.previewLayers[i].hdrMultiplier === 3, result.blackHoleIndex);
  const afterShape = await page.evaluate(i => {
    const { hdrMultiplier: _gain, ...shape } = window.__preview.previewLayers[i]; return JSON.stringify(shape);
  }, result.blackHoleIndex);
  if (beforeShape !== afterShape) throw Error('Brightness changed shape settings');
  await page.getByText('Display settings', { exact: true }).click();
  await page.getByLabel('View exposure (EV) value', { exact: true }).fill('-3');
  await page.waitForFunction(() => window.__preview.displayExposure.value === 0.125);
  // Direct pixel checks: standard view applies display gamma, toggles do not
  // change source radiance, and a sky brightness edit requires no cube bake.
  const displayChecks = await page.evaluate(async () => {
    const scene = window.__preview;
    const { defaultLayer } = await import('/src/core/layers.ts');
    const original = [...scene.previewLayers];
    const fixture = { ...defaultLayer('noise'), innerColor: {r:0.04,g:0.04,b:0.04,a:1}, outerColor: {r:0.04,g:0.04,b:0.04,a:1}, ditherAmount:0, previewTextureSize:64 };
    scene.setLayers([fixture]); scene.setHdrDisplay(false, 0); scene.renderFrame();
    const target = scene.hdrDisplay.target;
    const raw = () => { const pixel = new Uint16Array(4); scene.renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel); return [...pixel]; };
    const source = raw(), gl = scene.renderer.getContext(), displayed = new Uint8Array(4);
    gl.readPixels(gl.drawingBufferWidth/2|0, gl.drawingBufferHeight/2|0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, displayed);
    if (displayed[0] < 55 || displayed[0] > 65) throw Error(`Standard display gamma is wrong: ${displayed[0]}`);
    let renders = 0;
    const render = scene.renderer.render.bind(scene.renderer);
    scene.renderer.render = (...args) => { renders++; return render(...args); };
    scene.updateLayer(0, { ...fixture, hdrMultiplier: 3 });
    if (renders !== 0) throw Error('Brightness rebaked a sky cubemap');
    const id = scene.layerObjects[0].group.uuid;
    scene.setHdrDisplay(true, -2); scene.renderFrame();
    const afterGain = raw(); renders = 0;
    scene.setHdrDisplay(false, -2); scene.renderFrame();
    if (renders !== 1) throw Error('Display toggle rerendered the scene');
    if (raw().some((value, i) => value !== afterGain[i])) throw Error('Display toggle changed source radiance');
    if (scene.hdrDisplay.target !== target || scene.layerObjects[0].group.uuid !== id) throw Error('Display toggle replaced resources');
    if (source[0] === afterGain[0]) throw Error('Brightness did not affect radiance');
    scene.renderer.render = render;
    scene.setLayers(original); scene.setHdrDisplay(true, -3);
    return { standardPixel: displayed[0], cachedToggle: true, brightnessWithoutRebake: true };
  });
  await page.getByLabel('Viewport projection', { exact: true }).selectOption('2d');
  await page.waitForFunction(() => window.__preview.flatResources && !window.__preview.flatDirty);
  await page.getByLabel('HDR mapping', { exact: true }).selectOption('linear');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.local-review/hdr-tuning.png' });
  await page.getByRole('button', { name: 'Toggle HDR view', exact: true }).click();
  await page.waitForFunction(() => window.__preview.displayMapping.value === 2);
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await panel.waitFor();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('skybox.display'))?.hdr === false);
  await page.reload();
  await page.waitForFunction(() => window.__preview?.hdrDisplay?.target);
  if (await page.getByRole('button', { name: 'Toggle HDR view', exact: true }).getAttribute('aria-pressed') !== 'false') throw Error('Display preference was lost');
  if (errors.length) throw Error(errors.join('\n'));
  console.log(JSON.stringify({ fixture: existsSync('PersonalTemplate.zip') ? 'PersonalTemplate.zip' : 'nebula-jets preset', ...result, displayChecks, errors, checks: ['HDR edits in inspector', 'unchanged shape settings', 'linear export tile', 'display exposure', 'panorama mapping', 'regular panels remain available', 'display preferences survive reload'] }, null, 2));
} finally { await browser.close(); }
