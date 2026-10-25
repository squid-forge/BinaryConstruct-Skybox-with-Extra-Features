import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out = new URL('../Research/2026-10-25-package-fixes/', import.meta.url);
await mkdir(out, { recursive: true });
const bh = JSON.parse(await readFile(new URL('reported-black-hole.json', out), 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ viewport: { width: 1530, height: 900 } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', async d => { errors.push(d.message()); await d.dismiss(); });
  await page.goto('http://localhost:4189/?preset=galactic-rim'); await page.waitForTimeout(1800);
  const script = async () => { await page.getByRole('button', { name: 'Script', exact: true }).click(); return JSON.parse(await page.locator('textarea.script-text').inputValue()); };
  const apply = async scene => { await script(); await page.locator('textarea.script-text').fill(JSON.stringify(scene)); await page.getByRole('button', { name: 'Layers', exact: true }).click(); await page.waitForTimeout(900); };
  const shot = name => page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, out)) });
  const clouds = await script();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('button', { name: 'Add core nebula', exact: true }).click();
  await page.getByLabel('Core cloud brightness', { exact: true }).locator('..').locator('input[type=number]').fill('0.7');
  const coreScene = await script(), core = coreScene.layers.at(-1);
  if (!core.bandCoreOnly || core.bandCenterGlow !== 0 || core.bandIntensity !== 0.7 || core.seed === clouds.layers[0].seed) throw Error('Core cloud is not independent');
  if (coreScene.layers[0].bandCenterGlow !== clouds.layers[0].bandCenterGlow) throw Error('Core creation changed original glow');
  await page.getByRole('button', { name: 'Layers', exact: true }).click(); await shot('independent-core-nebula');
  // Exact supplied geometry/noise/palette, including length 200 and parent HDR 5.
  const scene = { version: 2, layers: [bh] };
  await apply(scene); await page.getByText(bh.name, { exact: true }).click(); await shot('reported-plumes-fixed');
  const fixed = await page.locator('.viewport canvas').screenshot();
  await apply({ version: 2, layers: [{ ...bh, jetHdrPower: 5 }] }); await shot('reported-plumes-old-hdr-shaping');
  const old = await page.locator('.viewport canvas').screenshot();
  if (fixed.equals(old)) throw Error('Independent plume HDR shaping made no rendering difference');
  await apply({ version: 2, layers: [{ ...bh, jetEnabled: false }] });
  if (fixed.equals(await page.locator('.viewport canvas').screenshot())) throw Error('Reported jets remain invisible');
  await apply({ ...clouds, layers: [...clouds.layers, bh] }); await shot('reported-plumes-on-clouds');
  // Exercise the production folder-export UI using a real browser directory handle
  // backed by OPFS for automation; no OS picker is simulated as user approval.
  await page.evaluate(() => { window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('package-export-verification', { create: true }); });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Resolution', { exact: true }).selectOption('512');
  await page.locator('#export-faces').uncheck(); await page.locator('#export-png').check();
  await page.getByLabel('Save directly to folder', { exact: true }).check();
  await page.locator('.export-go').click();
  await page.getByRole('status').filter({ hasText: 'Saved in skybox-' }).waitFor({ timeout: 120000 });
  const notice = await page.getByRole('status').textContent();
  const files = await page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('package-export-verification');
    const files = [];
    for await (const [folder, handle] of root.entries()) {
      if (handle.kind !== 'directory') continue;
      for await (const [name, file] of handle.entries()) { if (file.kind === 'file') files.push({ folder, name, size: (await file.getFile()).size }); }
    }
    return files;
  });
  if (!files.some(f => f.name.endsWith('.png') && f.size > 1000)) throw Error('Direct directory output absent');
  await shot('direct-folder-export-complete');
  await page.getByRole('link', { name: 'Help and usage guide' }).getAttribute('href').then(async href => {
    const help = await page.context().newPage(); await help.goto(new URL(href, page.url()).href);
    await help.getByRole('heading', { name: 'Credits', exact: true, level: 1 }).waitFor();
    if (!(await help.textContent('body')).includes('Alex Peterson')) throw Error('Author credit missing');
    await help.goto(new URL(href + '#credits', page.url()).href);
    await help.screenshot({ path: fileURLToPath(new URL('local-help-and-credits.png', out)) });
  });
  if (errors.length) throw Error(errors.join('\n'));
  await writeFile(new URL('browser-results.json', out), JSON.stringify({ notice, files, errors, checks: ['independent core', 'reported HDR-5 plume', 'directory output', 'local help'] }, null, 2));
  console.log('Package fixes browser verification passed', notice);
} finally { await browser.close(); }
