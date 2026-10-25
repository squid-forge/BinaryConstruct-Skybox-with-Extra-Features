import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const output = 'Docs/Research/edit-performance';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:4189/?preset=smoke-clouds');
  await page.getByLabel('Preview quality', { exact: true }).selectOption('low');
  await page.getByRole('button', { name: '+b.hole', exact: true }).click();
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  const scene = JSON.parse(await page.locator('textarea.script-text').inputValue());
  const cloud = scene.layers[0], blackhole = scene.layers.at(-1);
  const apply = async layers => {
    await page.getByRole('button', { name: 'Script', exact: true }).click();
    await page.locator('textarea.script-text').fill(JSON.stringify({ version: 2, layers }));
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await page.waitForTimeout(600);
  };
  await apply([cloud]);
  const cloudResult = await page.evaluate(async cloud => {
    const p = window.__preview, r = p.renderer, gl = r.getContext();
    const mesh = p.layerObjects[0].group.children[0], material = mesh.material, mask = material.uniforms.smokeTexture.value;
    r.render(p.scene, p.camera);
    const originalCompile = gl.compileShader, originalTexture = gl.createTexture, originalRender = r.render;
    let compiles = 0, textures = 0, renders = 0;
    gl.compileShader = function(...args) { compiles++; return originalCompile.apply(this, args); };
    gl.createTexture = function(...args) { textures++; return originalTexture.apply(this, args); };
    r.render = function(...args) { renders++; return originalRender.apply(this, args); };
    const edits = [];
    try {
      await new Promise(resolve => setTimeout(resolve, 400)); const idleRenders = renders;
      for (const cloudDensity of [0.8, 1.2, 1.8]) {
        const start = performance.now(); p.updateLayer(0, { ...cloud, cloudDensity }); r.render(p.scene, p.camera);
        edits.push(performance.now() - start); await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (idleRenders || compiles || textures) throw Error('Cloud edits still rebuild shaders/textures or redraw while idle');
      if (p.layerObjects[0].group.children[0] !== mesh || material.uniforms.smokeTexture.value !== mask || material.uniforms.smokeMedium.value.x !== 1.8) throw Error('Cloud update did not reuse and update the live material');
      return { idleRenders, compiles, textures, editMs: edits };
    } finally { gl.compileShader = originalCompile; gl.createTexture = originalTexture; r.render = originalRender; }
  }, cloud);
  const shape = { ...cloud, cloudDensity: 1.8, apparentSize: 0.63, aspect: 1.6, rotationDeg: 37, dirLonDeg: 4 };
  const visual = await page.evaluate(async shape => {
    const p = window.__preview, r = p.renderer;
    const capture = () => {
      r.render(p.scene, p.camera);
      const canvas = document.createElement('canvas'); canvas.width = r.domElement.width; canvas.height = r.domElement.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(r.domElement, 0, 0); return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    p.updateLayer(0, shape); const incremental = capture();
    p.setLayers([shape]); await Promise.all(p.layerObjects.map(o => o.ready));
    const fresh = capture(); let total = 0, peak = 0;
    for (let i = 0; i < fresh.length; i++) { const diff = Math.abs(fresh[i] - incremental[i]); total += diff; peak = Math.max(peak, diff); }
    const mean = total / fresh.length;
    if (mean > 0.1) throw Error(`Incremental cloud differs from a fresh build: ${mean}`);
    return { mean, peak };
  }, shape);
  await page.screenshot({ path: `${output}/reused-cloud.png` });
  const sky = { ...cloud, cloudEnabled: false, bandEnabled: true, previewTextureSize: 128, octaves: 3 };
  await apply([sky]);
  const skyResult = await page.evaluate(async sky => {
    const p = window.__preview, r = p.renderer, gl = r.getContext(); r.render(p.scene, p.camera);
    const cube = p.layerObjects[0].group.children[0].material.uniforms.cubeMap.value;
    const oldCompile = gl.compileShader, oldTexture = gl.createTexture, oldRender = r.render;
    let compiles = 0, textures = 0, bakes = 0;
    gl.compileShader = function(...args) { compiles++; return oldCompile.apply(this, args); };
    gl.createTexture = function(...args) { textures++; return oldTexture.apply(this, args); };
    r.render = function(...args) { if (this.getRenderTarget()?.isWebGLCubeRenderTarget) bakes++; return oldRender.apply(this, args); };
    try {
      for (const gain of [0.4, 0.45, 0.5]) { p.updateLayer(0, { ...sky, gain }); await new Promise(resolve => setTimeout(resolve, 100)); }
      if (compiles || textures || bakes !== 18 || p.layerObjects[0].group.children[0].material.uniforms.cubeMap.value !== cube) throw Error(`Sky edits did not reuse their cubemap: ${JSON.stringify({ compiles, textures, bakes })}`);
      return { compiles, textures, bakes };
    } finally { gl.compileShader = oldCompile; gl.createTexture = oldTexture; r.render = oldRender; }
  }, sky);
  await apply([{ ...blackhole, jetEnabled: true }]);
  const lensResult = await page.evaluate(async blackhole => {
    const p = window.__preview, gl = p.renderer.getContext();
    const oldCompile = gl.compileShader, oldCapture = p.captureAll;
    let compiles = 0, captures = 0;
    gl.compileShader = function(...args) { compiles++; return oldCompile.apply(this, args); };
    p.captureAll = function(...args) { captures++; return oldCapture.apply(this, args); };
    try {
      for (const jetBrightness of [0.8, 1.1, 1.4]) p.updateLayer(0, { ...blackhole, jetEnabled: true, jetBrightness });
      await new Promise(resolve => setTimeout(resolve, 400));
      if (compiles || captures !== 1) throw Error(`Native lens/jet programs or capture passes were rebuilt redundantly: ${JSON.stringify({ compiles, captures })}`);
      return { compiles, captures };
    } finally { gl.compileShader = oldCompile; p.captureAll = oldCapture; }
  }, blackhole);
  await apply([cloud]);
  const density = page.getByLabel('Smoke density value', { exact: true });
  await density.fill('1.4'); await density.fill('1.7'); await density.fill('2.1');
  await page.waitForFunction(() => window.__preview.layerObjects[0].group.children[0].material.uniforms.smokeMedium.value.x === 2.1);
  await density.fill('2.7'); await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await density.fill('3.1');
  await page.waitForFunction(() => window.__preview.layerObjects[0].group.children[0].material.uniforms.smokeMedium.value.x === 3.1);
  await page.getByRole('button', { name: '+stars', exact: true }).click();
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  const stars = JSON.parse(await page.locator('textarea.script-text').inputValue()).layers.at(-1);
  const masks = await page.evaluate(stars => {
    const p = window.__preview, first = p.bakeMask({ ...stars, maskSeed: 123 });
    if (first !== p.bakeMask({ ...stars, maskSeed: 123, pointSize: 3 })) throw Error('Render-only star edits rebaked their placement mask');
    const different = p.bakeMask({ ...stars, maskSeed: 124 });
    if (different === first) throw Error('Changed mask seed reused the wrong placement');
    p.bakeMask({ ...stars, maskSeed: 125 });
    if (p.maskCache.size !== 2) throw Error('Placement mask cache exceeded its memory bound');
    return { reused: true, changedSeed: true, entries: p.maskCache.size };
  }, stars);
  if (errors.length) throw Error(errors.join('\n'));
  await writeFile(`${output}/results.json`, JSON.stringify({ cloud: cloudResult, visual, sky: skyResult, lens: lensResult, masks, errors }, null, 2));
  console.log(JSON.stringify({ cloud: cloudResult, visual, sky: skyResult, lens: lensResult, masks }));
} finally { await browser.close(); }
