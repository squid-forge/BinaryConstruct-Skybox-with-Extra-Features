import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const output = new URL('../Research/2026-10-25-package-fixes/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
 const page = await browser.newPage({ viewport: { width: 1530, height: 783 } });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto('http://localhost:4189/?preset=galactic-rim'); await page.waitForTimeout(1500);
 await page.getByRole('button', { name: 'Script', exact: true }).click();
 const scene = JSON.parse(await page.locator('textarea.script-text').inputValue());
 scene.layers[0].bandIntensity = 0.3; scene.layers[0].bandCenterGlow = 0.15;
 scene.layers.push({ type: 'blackhole', name: 'Small black hole visibility', seed: 68166, dirLonDeg: -17.48, dirLatDeg: -3.198, apparentSize: 0.01, jetEnabled: true, jetBaseVisible: true, jetSeed: 68897, jetSize: 5.3 });
 await page.locator('textarea.script-text').fill(JSON.stringify(scene));
 await page.getByRole('button', { name: 'Layers', exact: true }).click();
 await page.getByText('Small black hole visibility', { exact: true }).click(); await page.waitForTimeout(700);
 await page.screenshot({ path: fileURLToPath(new URL('small-hole-native-plumes.png', output)) });
 const withJets = await page.locator('.viewport canvas').screenshot();
 await page.getByLabel('Show jets', { exact: true }).uncheck(); await page.waitForTimeout(500);
 const withoutJets = await page.locator('.viewport canvas').screenshot();
 if (withJets.equals(withoutJets)) throw Error('Jets make no difference at screenshot settings');
 await writeFile(new URL('small-hole-scene.json', output), JSON.stringify(scene, null, 2));
 if (errors.length) throw Error(errors.join('\n'));
 console.log('Small-horizon plume visibility check passed');
} finally { await browser.close(); }
