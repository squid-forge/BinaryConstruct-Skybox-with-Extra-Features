import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const output = new URL('../Research/2026-10-25-native-jet-quality/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto('http://localhost:4189/?preset=nebula-jets'); await page.waitForTimeout(1800);
  await page.screenshot({ path: fileURLToPath(new URL('native-jet-preset.png', output)) });
  const result = await page.evaluate(async () => {
    const scene = window.__preview;
    const layer = { type: 'blackhole', name: 'Procedural quality', seed: 71,
      sourceBlendFactor: 'one', destBlendFactor: 'one', apparentSize: 0.035,
      dirLonDeg: 0, dirLatDeg: 0, coreVisible: false,
      lensStrength: 0.6, photonRing: 0.7, discAmount: 0.8, discInner: 1.7, discOuter: 3.6,
      discTiltDeg: 100, discSpinDeg: 0, discKelvin: 4500, discDoppler: 0.5,
      jetEnabled: true, jetSize: 1, jetLength: 10, jetGap: 3, jetWidth: 0.6,
      jetCurveStart: 2, jetCurve: 0.65, jetAngleDeg: 55, jetConeDeg: 9,
      jetNoiseType: 'ridged', jetNoiseScale: 22, jetOctaves: 10, jetGain: 0.65,
      jetWarp: 0.65, jetWarpScale: 1.6, jetContrast: 1.2,
      jetDensity: 2, jetBrightness: 2, hdrMultiplier: 3, tipGlow: 0, jetAsymmetry: 0,
      jetColor: { r: 0.3, g: 0.75, b: 1, a: 1 }, jetOuterColor: { r: 0.02, g: 0.08, b: 0.18, a: 1 } };
    const half = value => {
      const sign = value & 0x8000 ? -1 : 1, e = (value >> 10) & 31, f = value & 1023;
      return sign * (e === 0 ? 2 ** -14 * f / 1024 : e === 31 ? Infinity : 2 ** (e - 15) * (1 + f / 1024));
    };
    const images = [], stats = [];
    for (const size of [1024, 2048]) {
      const source = await scene.createTileSource([layer], size);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d'), data = ctx.createImageData(size, size);
      let peak = 0, peakX = 0, peakY = 0, centerPeak = 0, nonzero = 0;
      try {
        for (let y = 0; y < size; y += source.tileSize) for (let x = 0; x < size; x += source.tileSize) {
          const tile = source.render(5, x, y);
          for (let ty = 0; ty < source.tileSize; ty++) for (let tx = 0; tx < source.tileSize; tx++) {
            const src = (ty * source.tileSize + tx) * 4, dst = ((y + ty) * size + x + tx) * 4;
            let max = 0;
            for (let c = 0; c < 3; c++) {
              const v = half(tile[src + c]); if (!Number.isFinite(v)) throw Error('Non-finite procedural radiance');
              max = Math.max(max, v); data.data[dst + c] = Math.round(255 * Math.pow(v / (1 + v), 1 / 2.2));
            }
            if (max > peak) { peak = max; peakX = x + tx; peakY = y + ty; } if (max > 0.001) nonzero++;
            if (Math.abs(x + tx - size / 2) < 16 && Math.abs(y + ty - size / 2) < 16) centerPeak = Math.max(centerPeak, max);
            data.data[dst + 3] = 255;
          }
        }
      } finally { source.dispose(); }
      ctx.putImageData(data, 0, 0);
      images.push({ name: 'native-jets-' + size, png: canvas.toDataURL().split(',')[1] });
      // Same angular region, displayed at native output pixels, for close inspection.
      const crop = document.createElement('canvas'); crop.width = crop.height = 512;
      crop.getContext('2d').drawImage(canvas, size * 0.23, size * 0.16, size * 0.25, size * 0.25, 0, 0, 512, 512);
      images.push({ name: 'native-jets-' + size + '-detail', png: crop.toDataURL().split(',')[1] });
      stats.push({ size, peakX, peakY, peakRadiance: peak, centerPeak, nonzeroFraction: nonzero / size ** 2 });
    }
    const anchor = stats.at(-1), tileStats = [];
    for (const size of [8192, 16384]) {
      const source = await scene.createTileSource([layer], size);
      try {
        const x = Math.min(size - 256, Math.max(0, Math.round(anchor.peakX / anchor.size * size - 128)));
        const y = Math.min(size - 256, Math.max(0, Math.round(anchor.peakY / anchor.size * size - 128)));
        const tile = source.render(5, x, y);
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d'), data = ctx.createImageData(256, 256);
        let peak = 0;
        for (let i = 0; i < 256 * 256; i++) {
          for (let c = 0; c < 3; c++) {
            const v = half(tile[i * 4 + c]); if (!Number.isFinite(v)) throw Error('Non-finite high-resolution radiance');
            peak = Math.max(peak, v); data.data[i * 4 + c] = Math.round(255 * Math.pow(v / (1 + v), 1 / 2.2));
          }
          data.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(data, 0, 0);
        images.push({ name: 'native-jets-' + size + '-native-pixel-tile', png: canvas.toDataURL().split(',')[1] });
        tileStats.push({ faceSize: size, x, y, tileSize: 256, peakRadiance: peak });
      } finally { source.dispose(); }
    }
    return { images, stats, tileStats, activeTileSources: scene.activeTileSources };
  });
  for (const image of result.images) await writeFile(new URL(image.name + '.png', output), Buffer.from(image.png, 'base64'));
  if (result.stats.some(s => s.peakRadiance <= 1 || s.centerPeak !== 0 || s.nonzeroFraction < 0.01)) throw Error('Native procedural HDR/gap coverage check failed');
  if (result.activeTileSources !== 0) throw Error('Tile sources were not released');
  if (errors.length) throw Error(errors.join('\n'));
  await writeFile(new URL('results.json', output), JSON.stringify({ errors, stats: result.stats, tileStats: result.tileStats, activeTileSources: result.activeTileSources }, null, 2));
  console.log(JSON.stringify({ stats: result.stats, tileStats: result.tileStats }));
} finally { await browser.close(); }
