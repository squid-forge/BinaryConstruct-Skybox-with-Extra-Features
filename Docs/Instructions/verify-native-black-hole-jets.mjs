import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const output = new URL('../Research/2026-10-24-native-black-hole-jets/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: process.env.HARDWARE_RENDERER === '1' ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const errors = [], downloads = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', async d => { errors.push(d.message()); await d.accept(); });
const set = async (label, value) => page.getByLabel(label, { exact: true }).locator('..').locator('input[type=number]').fill(String(value));
const settle = async () => page.waitForTimeout(650);
const shot = async name => { await settle(); await page.screenshot({ path: fileURLToPath(new URL(name + '.png', output)) }); };
const canvasBytes = () => page.locator('.viewport canvas').screenshot();
const scene = async () => {
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  return JSON.parse(await page.locator('textarea.script-text').inputValue());
};
const selectBH = async () => { await page.getByRole('button', { name: 'Layers', exact: true }).click(); await page.getByText('New Black Hole', { exact: true }).click(); };
try {
  await page.goto('http://localhost:4189/?preset=galactic-rim'); await page.waitForTimeout(1600);
  const rendererInfo = await page.evaluate(() => { const gl = window.__preview.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
  // Independent galactic clouds: edit the added cloud, then inspect both records.
  await page.getByRole('button', { name: 'Stack another band nebula', exact: true }).click();
  await set('Band thickness (deg)', 16); await set('Band brightness', 0.3);
  const clouds = await scene();
  if (clouds.layers[0].bandWidthDeg !== 9 || clouds.layers[3].bandWidthDeg !== 16 || clouds.layers[0].bandIntensity === 0.3) throw Error('Stacked galactic nebula settings are coupled');
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('button', { name: '+b.hole', exact: true }).click();
  await page.getByLabel('Show jets', { exact: true }).check();
  await set('Plume size', 0.65); await set('Jet length', 9); await set('Plume launch gap', 4);
  await set('Curve start distance', 3); await set('Plume curvature', 0.8); await set('Jet cone (deg)', 8);
  await set('Jet angle (deg)', 75); await set('Plume density', 2); await set('Plume brightness', 1.5);
  await page.getByLabel('Plume color bands', { exact: true }).check();
  await page.getByLabel('Color bands along length', { exact: true }).check();
  await page.locator('.ramp-editor select').selectOption('Reflection blue');
  await shot('native-black-hole-jets');
  await page.getByRole('button', { name: 'Stack another nebula jet', exact: true }).click();
  await page.getByLabel('Jet stack name', { exact: true }).fill('Warm outer plume');
  await set('Jet length', 13); await set('Plume launch gap', 5); await set('Curve start distance', 2);
  await set('Plume curvature', -0.7); await set('Jet angle (deg)', 35); await set('Plume size', 0.55);
  await page.locator('.ramp-editor select').selectOption('Hubble SHO');
  await shot('independent-native-jet-stacks');
  const independent = await scene(), bh = independent.layers.at(-1);
  if (bh.type !== 'blackhole' || bh.jetLength !== 9 || bh.jetGap !== 4 || bh.jetCurve !== 0.8 || bh.jetLayers[0].jetLength !== 13 || bh.jetLayers[0].jetCurve !== -0.7 || bh.jetLayers[0].name !== 'Warm outer plume' || bh.jetLayers[0].seed === (bh.jetSeed ?? bh.seed)) throw Error('Jet stack settings/seeds are coupled');
  if (bh.jetColorRamp[1].color.r === bh.jetLayers[0].jetColorRamp[1].color.r) throw Error('Jet color ramp edit affected base');
  await selectBH(); await page.getByLabel('Jet stack', { exact: true }).selectOption('0');
  const baseline = await canvasBytes();
  await page.getByLabel('Show this jet stack', { exact: true }).uncheck(); await settle();
  if (baseline.equals(await canvasBytes())) throw Error('Stack visibility did not affect native rendering');
  await page.getByLabel('Show this jet stack', { exact: true }).check(); await settle();
  if (!baseline.equals(await canvasBytes())) throw Error('Native stack visibility restoration changed deterministic output');
  await page.getByLabel('Show central object', { exact: true }).uncheck(); await shot('native-plumes-only');
  if (baseline.equals(await canvasBytes())) throw Error('Native core toggle had no effect');
  await page.getByLabel('Show central object', { exact: true }).check(); await settle();
  // Native proxy drag moves the hole and all its attached jet meshes together.
  const box = await page.locator('.viewport canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 90, cy - 45, { steps: 8 }); await page.mouse.up(); await settle();
  const moved = await scene(), movedBH = moved.layers.at(-1);
  if (movedBH.dirLonDeg === bh.dirLonDeg && movedBH.dirLatDeg === bh.dirLatDeg) throw Error('Native black-hole drag did not commit');
  if (JSON.stringify(movedBH.jetLayers) !== JSON.stringify(bh.jetLayers)) throw Error('Drag changed independent jet settings');
  await selectBH(); await shot('native-stacks-dragged');
  // Restore center via native properties, then exercise save/load without any baked assets.
  await set(/^Longitude/, 0); await set(/^Latitude/, 0); await settle();
  const saved = await scene();
  await writeFile(new URL('native-jet-stacks.json', output), JSON.stringify(saved, null, 2));
  await page.locator('input[type=file]').first().setInputFiles({ name: 'native-jet-stacks.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await settle(); await selectBH();
  await page.getByLabel('Jet stack', { exact: true }).selectOption('0');
  if (await page.getByLabel('Jet stack name', { exact: true }).inputValue() !== 'Warm outer plume') throw Error('Jet stacks were not restored from saved JSON');
  await shot('native-stacks-restored');
  // PNG/HDR composites include all attached stacks; repeated HDR must be byte-identical.
  for (const suffix of ['first', 'repeat']) {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByLabel('Resolution', { exact: true }).selectOption('512');
    await page.locator('#export-faces').uncheck(); await page.locator('#export-png').setChecked(true); await page.locator('#export-hdr').check();
    const pending = [];
    const handler = d => { const filename = suffix + '-' + d.suggestedFilename(); const path = fileURLToPath(new URL(filename, output)); pending.push(d.saveAs(path).then(() => downloads.push(filename))); };
    page.on('download', handler);
    await page.locator('.export-go').click();
    await page.waitForFunction(() => !document.querySelector('.export-panel') || !document.querySelector('.export-go').disabled, undefined, { timeout: 120000 });
    await page.waitForTimeout(250); await Promise.all(pending); page.off('download', handler);
    if (pending.length !== 2) throw Error('Missing native composite download');
  }
  const hdr = downloads.filter(name => name.endsWith('.hdr'));
  const hashes = await Promise.all(hdr.map(async name => createHash('sha256').update(await readFile(new URL(name, output))).digest('hex')));
  if (hashes[0] !== hashes[1]) throw Error('Native stack HDR export is not deterministic');
  // Cancelling a tiled job must release renderer ownership and restart preview.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Resolution', { exact: true }).selectOption('2048');
  await page.locator('#export-png').uncheck();
  await page.locator('.export-go').click();
  await page.waitForFunction(() => window.__preview.activeTileSources === 1, undefined, { timeout: 120000 });
  await page.getByRole('button', { name: 'Cancel export', exact: true }).click();
  await page.waitForFunction(() => window.__preview.activeTileSources === 0 && !document.querySelector('.export-go').disabled);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await selectBH(); await page.getByLabel('Jet stack', { exact: true }).selectOption('-1');
  const beforeEdit = await canvasBytes();
  await set('Plume size', 0.7); await settle();
  if (beforeEdit.equals(await canvasBytes())) throw Error('Preview did not resume after export cancellation');
  // A foreground native lens captures the lower hole and its jet stacks in order.
  const multiple = await scene();
  multiple.layers.push({ ...multiple.layers.at(-1), name: 'Secondary lens', dirLonDeg: -28, dirLatDeg: 13, apparentSize: 0.025, jetEnabled: false, jetLayers: [] });
  await page.locator('textarea.script-text').fill(JSON.stringify(multiple));
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await shot('stacked-native-lenses');
  if (errors.length) throw Error(errors.join('\n'));
  await writeFile(new URL('results.json', output), JSON.stringify({ errors, rendererInfo, downloads, hdrHashes: hashes, checks: ['independent galactic nebula controls', 'built-in native lens with nebula jets', 'independent named/seeded jet stack and color ramp', 'stack visibility and deterministic restoration', 'native plumes-only mode', 'attached stacks follow native drag', 'scene JSON reload restores jet stacks', 'composite PNG/HDR downloads and HDR determinism', 'export cancellation releases renderer and resumes preview', 'foreground lens with lower native jet stacks'] }, null, 2));
  console.log('Native black-hole jet stack checks passed');
} finally { await browser.close(); }
