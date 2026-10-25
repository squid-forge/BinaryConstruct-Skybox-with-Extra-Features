import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const output = 'Docs/Research/preview-quality';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:4189/?preset=galactic-rim');
  await page.getByRole('button', { name: '+b.hole', exact: true }).click();
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  const initial = JSON.parse(await page.locator('textarea.script-text').inputValue());
  const layers = [
    { ...initial.layers.find(l => l.type === 'noise'), name: 'Preview nebula', previewTextureSize: 512, octaves: 3, smokeEnabled: false },
    { ...initial.layers.find(l => l.type === 'points'), name: 'Hidden stars', visible: false, numPoints: 100 },
    { ...initial.layers.find(l => l.type === 'blackhole'), name: 'Preview lens', jetEnabled: false, dirLonDeg: 0, dirLatDeg: 0 },
    { ...initial.layers.find(l => l.type === 'points'), name: 'Visible stars', visible: true, seed: 17, numPoints: 400, pointSize: 2 },
  ];
  await page.locator('textarea.script-text').fill(JSON.stringify({ version: 2, layers }));
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByLabel('Field of view value', { exact: true }).fill('55');
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  const before = await page.locator('textarea.script-text').inputValue();
  const readMetrics = () => page.evaluate(() => {
    const p = window.__preview, cubes = [];
    p.scene.traverse(o => {
      for (const name of ['cubeMap', 'bgCube']) {
        const texture = o.material?.uniforms?.[name]?.value;
        if (texture) cubes.push({ name, width: texture.image?.[0]?.width });
      }
    });
    return { width: p.renderer.domElement.width, height: p.renderer.domElement.height, cubes, fov: p.camera.fov, hidden: p.layerObjects[1].group.visible === false };
  });
  const cases = [];
  for (const quality of ['low', 'medium', 'high']) {
    await page.getByLabel('Preview quality', { exact: true }).selectOption(quality);
    await page.waitForTimeout(250);
    const metrics = await readMetrics();
    if (!metrics.hidden || metrics.fov !== 55) throw Error('Quality change lost visibility or camera state');
    const expected = { low: [128, 128], medium: [256, 256], high: [512, 1024] }[quality];
    if (metrics.cubes.find(c => c.name === 'cubeMap')?.width !== expected[0] || metrics.cubes.find(c => c.name === 'bgCube')?.width !== expected[1]) throw Error(`Preview buffers not resized: ${JSON.stringify(metrics)}`);
    cases.push({ quality, ...metrics });
    if (quality !== 'medium') await page.screenshot({ path: `${output}/${quality}.png` });
  }
  if (cases[0].width >= cases[1].width || cases[1].width >= cases[2].width) throw Error('Viewport resolution does not follow quality');
  if (await page.locator('textarea.script-text').inputValue() !== before) throw Error('Quality changed saved scene data');
  // A real export tile must be identical at Low and High preview settings.
  const exports = [];
  for (const quality of ['low', 'high']) {
    await page.getByLabel('Preview quality', { exact: true }).selectOption(quality);
    const result = await page.evaluate(async ({ layers, quality }) => {
      const p = window.__preview, renderer = p.renderer, original = renderer.render;
      const captures = [];
      renderer.render = function(scene, camera) {
        scene.traverse(o => { const t = o.material?.uniforms?.bgCube?.value; if (t) captures.push(t.image[0].width); });
        return original.call(this, scene, camera);
      };
      let source;
      try {
        source = await p.createTileSource(layers.filter(l => l.visible !== false), 512);
        if (quality === 'high') {
          const width = renderer.domElement.width;
          p.setPreviewQuality('low');
          if (renderer.domElement.width !== width) throw Error('Quality changed the renderer during an active export');
        }
        const tile = source.render(5, 128, 128);
        const nonzero = tile.some((v, i) => i % 4 !== 3 && v > 0);
        const equal = quality === 'low' || tile.every((v, i) => v === window.__qualityTile[i]);
        if (quality === 'low') window.__qualityTile = tile;
        return { nonzero, equal, captures };
      } finally { renderer.render = original; source?.dispose(); }
    }, { layers, quality });
    if (!result.nonzero || !result.equal || result.captures.some(size => size !== 512)) throw Error('Preview quality affected export pixels/capture resolution');
    exports.push({ quality, ...result });
  }
  if (await page.evaluate(() => window.__preview.previewQuality) !== 'low') throw Error('Deferred quality change was not applied after export');
  // Synchronize the UI selection after exercising the renderer's deferred API.
  await page.getByLabel('Preview quality', { exact: true }).selectOption('low');
  await page.getByLabel('Viewport projection', { exact: true }).selectOption('2d');
  for (const [quality, expected] of [['low', 128], ['high', 512]]) {
    await page.getByLabel('Preview quality', { exact: true }).selectOption(quality);
    await page.waitForFunction(expected => window.__preview.flatResources?.target.width === expected, expected);
  }
  await page.getByLabel('Preview quality', { exact: true }).selectOption('low');
  await page.reload();
  if (await page.getByLabel('Preview quality', { exact: true }).inputValue() !== 'low') throw Error('Preview preference was not saved');
  await page.setViewportSize({ width: 370, height: 800 });
  const showControls = page.getByRole('button', { name: 'Show controls', exact: true });
  if (await showControls.isVisible()) await showControls.click();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Quality control causes horizontal overflow');
  await page.screenshot({ path: `${output}/mobile.png` });
  if (errors.length) throw Error(errors.join('\n'));
  await writeFile(`${output}/results.json`, JSON.stringify({ cases, exports, errors }, null, 2));
  console.log('Preview resolution, buffer sizes, saved state and unchanged export pixels verified');
} finally { await browser.close(); }
