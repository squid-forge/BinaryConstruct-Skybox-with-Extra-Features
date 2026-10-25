import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out = new URL('../Research/2026-10-25-smoke-seams/', import.meta.url); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:4189/?preset=galactic-rim'); await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  const project = JSON.parse(await page.locator('textarea.script-text').inputValue());
  const layer = { ...project.layers[0], bandEnabled: false, smokeEnabled: true, cloudMask: 'puff', cloudMaskScale: 0.6, cloudErosion: 0, cloudAbsorption: 0, cloudAmbient: 1, cloudShadow: 2, cloudLightPower: 0, cloudLight2Power: 0, cloudFeather: 0.2, previewTextureSize: 128 };
  const result = await page.evaluate(async layer => {
    const preview = window.__preview, renderer = preview.renderer;
    const source = await preview.createTileSource([layer], 512);
    const originalRender = renderer.render; let material;
    renderer.render = function(scene, camera) {
      scene.traverse(o => { if (o.material?.uniforms?.smokeSpherical) material = o.material; });
      return originalRender.call(renderer, scene, camera);
    };
    const half = n => {
      const e = (n >>> 10) & 31, f = n & 1023, sign = n & 32768 ? -1 : 1;
      return sign * (e === 0 ? f * 2 ** -24 : (1 + f / 1024) * 2 ** (e - 15));
    };
    try {
      source.render(5, 0, 0);
      if (!material.uniforms.smokeSpherical.value) throw Error('Global smoke did not select spherical mapping');
      const common = material.fragmentShader.split('uniform bool bandEnabled;')[0];
      material.fragmentShader = common + 'uniform vec2 probeUV; void main(){float d=smokeDensityAt(probeUV); fragColor=vec4(smokeShade(probeUV,vec3(d)),1.0);}';
      material.uniforms.probeUV = { value: { x: 0, y: 0.5 } }; material.needsUpdate = true;
      const probe = (x, y = 0.5) => { material.uniforms.probeUV.value = { x, y }; return Array.from(source.render(5, 0, 0).slice(0, 3), half); };
      const cases = [];
      for (const scale of [0.6, 1, 1.7]) {
        material.uniforms.smokeShape.value.y = scale;
        for (const latitude of [0.3, 0.5, 0.7]) {
          const left = probe(0, latitude), right = probe(1, latitude);
          if (left.some((n, i) => !Number.isFinite(n) || Math.abs(n - right[i]) > 0.01)) throw Error(`Smoke seam differs at scale ${scale}`);
          cases.push({ scale, latitude, left, right });
        }
      }
      material.uniforms.smokeShape.value.y = 0.6;
      if (probe(0).every(n => n < 0.001)) throw Error('Dark stripe still exists at the longitude seam');
      material.uniforms.smokeLight1.value.x = 0.9; material.uniforms.smokeLight1.value.w = 2;
      const litLeft = probe(0), litRight = probe(1);
      if (litLeft.some((n, i) => Math.abs(n - litRight[i]) > 0.01)) throw Error('Lighting/shadow wrap is discontinuous');
      // A finite particle silhouette with transparent borders must overlap at
      // repeated tile boundaries, rather than cutting a rectangular grid.
      const texture = material.uniforms.smokeTexture.value;
      const fixture = texture.clone(), canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const context = canvas.getContext('2d');
      context.fillStyle = 'white'; context.fillRect(4, 4, 24, 24);
      fixture.image = canvas; fixture.needsUpdate = true;
      material.uniforms.smokeTexture.value = fixture;
      const densityShader = material.fragmentShader;
      material.fragmentShader = common + 'uniform vec2 probeUV; void main(){fragColor=vec4(vec3(smokeStamp(probeUV)),1.0);}';
      material.needsUpdate = true;
      const tileJoins = [];
      try {
        for (const boundary of [-1, 0, 1, 2]) {
          for (const along of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
            for (const vertical of [false, true]) {
              const sample = offset => vertical ? probe(along, boundary + offset)[0] : probe(boundary + offset, along)[0];
              const before = sample(-0.0001), at = sample(0), after = sample(0.0001);
              if (at < 0.5 || Math.abs(before - after) > 0.005) throw Error('Transparent particle border leaves a mask tile gap');
              tileJoins.push({ boundary, along, vertical, before, at, after });
            }
          }
        }
      } finally {
        material.uniforms.smokeTexture.value = texture; fixture.dispose();
        material.fragmentShader = densityShader; material.needsUpdate = true;
      }
      material.uniforms.smokeSpherical.value = false;
      const localEdge = probe(0), localCenter = probe(0.5);
      if (localEdge.some(n => n !== 0) || localCenter.every(n => n === 0)) throw Error('Finite local cloud edge was changed');
      return { cases, litLeft, litRight, tileJoins, localEdge, localCenter };
    } finally { renderer.render = originalRender; source.dispose(); }
  }, layer);
  await page.locator('textarea.script-text').fill(JSON.stringify({ version: 2, layers: [layer] }));
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByLabel('Viewport projection', { exact: true }).selectOption('2d'); await page.waitForTimeout(1500);
  await page.screenshot({ path: fileURLToPath(new URL('global-smoke-wrap.png', out)) });
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  await page.locator('textarea.script-text').fill(JSON.stringify({ version: 2, layers: [{ ...layer, bandEnabled: true, cloudMaskScale: 4 }] }));
  await page.getByRole('button', { name: 'Layers', exact: true }).click(); await page.waitForTimeout(1500);
  await page.screenshot({ path: fileURLToPath(new URL('band-mask-joins.png', out)) });
  if (errors.length) throw Error(errors.join('\n'));
  await writeFile(new URL('results.json', out), JSON.stringify({ ...result, errors }, null, 2));
  console.log('Global smoke seam, wrapped lighting and finite local-edge checks passed');
} finally { await browser.close(); }
