import { describe, expect, it } from 'vitest';
import { compareHdrPreview, hdrPreviewBytes, captureHdrPreview } from './hdrPreview';
import { softenPanorama, softnessRadius } from './softness';
import type { PreviewScene } from '../render/PreviewScene';

describe('native HDR smoothness preview', () => {
  it('matches full-panorama filtering at the longitude seam and pole boundary', () => {
    const width = 16, height = 12, exportHeight = 4096, amount = 1;
    const pixels = Float32Array.from({ length: width * height * 4 }, (_, i) => i % 4 === 3 ? 1 : Math.floor(i / 4) + (i % 4) * 0.25);
    const padding = softnessRadius(exportHeight, amount) + 1, cropWidth = 6, cropHeight = 4;
    const sw = cropWidth + padding * 2, sh = cropHeight + padding * 2;
    const crop = new Float32Array(sw * sh * 4), originX = 14, originY = 0;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const sy = Math.max(0, Math.min(height - 1, originY + y - padding));
      const sx = ((originX + x - padding) % width + width) % width;
      crop.set(pixels.subarray((sy * width + sx) * 4, (sy * width + sx + 1) * 4), (y * sw + x) * 4);
    }
    const preview = compareHdrPreview({ pixels: crop, width: cropWidth, height: cropHeight, padding, exportHeight }, amount);
    const full = softenPanorama((y, out) => out.set(pixels.subarray(y * width * 4, (y + 1) * width * 4)), width, height, amount, exportHeight);
    const row = new Float32Array(width * 4);
    for (let y = 0; y < cropHeight; y++) {
      full(originY + y, row);
      for (let x = 0; x < cropWidth; x++) for (let c = 0; c < 3; c++) {
        expect(preview.softened[(y * cropWidth + x) * 4 + c]).toBeCloseTo(row[((originX + x) % width) * 4 + c], 4);
      }
    }
    expect(compareHdrPreview({ pixels: crop, width: cropWidth, height: cropHeight, padding, exportHeight }, 0).softened).toEqual(preview.native);
  });
  it('shows unclipped HDR via exposure/tone mapping without changing source radiance', () => {
    const pixels = new Float32Array([16, 4, 1, 1, 0, 0, 0, 1]), copy = pixels.slice();
    const mapped = hdrPreviewBytes(pixels, 0, 'reinhard');
    expect(mapped[0]).toBeLessThan(255); expect(mapped[0]).toBeGreaterThan(mapped[1]);
    expect(hdrPreviewBytes(pixels, -4, 'linear')[0]).toBe(255);
    expect(hdrPreviewBytes(pixels, -6, 'linear')[0]).toBeLessThan(255);
    expect(pixels).toEqual(copy); expect(mapped[3]).toBe(255);
    expect(hdrPreviewBytes(new Float32Array([Infinity, 0, 0, 1]), 0, 'reinhard')[0]).toBe(255);
  });
  it('releases native tile resources when preview capture is cancelled', async () => {
    let disposed = false;
    const controller = new AbortController();
    const source = { size: 512, tileSize: 8, render: () => new Uint16Array(8 * 8 * 4), dispose: () => { disposed = true; } };
    const scene = { createTileSource: async () => source } as unknown as PreviewScene;
    await expect(captureHdrPreview(scene, [], 512, { lonDeg: 0, latDeg: 0 }, controller.signal, () => controller.abort())).rejects.toMatchObject({ name: 'AbortError' });
    expect(disposed).toBe(true);
  });
});
