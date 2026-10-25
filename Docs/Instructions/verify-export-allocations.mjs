import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const output = new URL('../Research/2026-10-25-viewport-ui/', import.meta.url); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:4189/?preset=smoke-clouds'); await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  await page.locator('textarea.script-text').fill(JSON.stringify({ version: 2, layers: [0, 1, 2].map(seed => ({ type: 'volumetric', name: `Volume ${seed}`, seed, steps: 8, previewTextureSize: 64 })) }));
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  const layers = JSON.parse(await page.locator('textarea.script-text').inputValue()).layers;
  const results = await page.evaluate(async layers => {
    const scene = window.__preview, gl = scene.renderer.getContext(), allocations = [];
    const original = gl.texStorage2D;
    gl.texStorage2D = function(...args) { allocations.push({ target: args[0], width: args[3], height: args[4] }); return original.apply(gl, args); };
    try {
      const source = await scene.createTileSource(layers, 16384);
      try {
        const data = source.render(5, 8192, 8192);
        if (data.length !== 256 * 256 * 4) throw Error('Incorrect tile size');
      } finally { source.dispose(); }
    } finally { gl.texStorage2D = original; }
    return { allocations, activeTileSources: scene.activeTileSources };
  }, layers);
  if (results.allocations.some(a => a.width > 256 || a.height > 256)) throw Error('Volumetric export allocated a large cubemap');
  if (results.activeTileSources !== 0 || errors.length) throw Error(JSON.stringify({ errors, results }));
  await writeFile(new URL('allocation-results.json', output), JSON.stringify({ ...results, errors, faceSize: 16384, volumeCount: 3, note: 'Native 256px patch, not a full 16K download' }, null, 2));
  console.log('Three-volume native 16K tile allocation check passed');
} finally { await browser.close(); }
