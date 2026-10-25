import type { Layer } from '../core/layers';
import type { PreviewScene } from '../render/PreviewScene';
import { TileSampler } from './tiles';
import { softenPanorama, softnessRadius } from './softness';

export interface HdrPreviewData {
  pixels: Float32Array;
  width: number;
  height: number;
  padding: number;
  exportHeight: number;
}

/** Native-resolution panorama crop plus a filter halo; bounded independent of full image area. */
export async function captureHdrPreview(scene: PreviewScene, layers: Layer[], size: number,
  center: { lonDeg: number; latDeg: number }, signal: AbortSignal, progress: (fraction: number) => void,
  options: { lensResolution?: number | 'native' } = {},
): Promise<HdrPreviewData> {
  signal.throwIfAborted();
  const width = 384, height = 192, padding = softnessRadius(size, 4) + 1;
  const sw = width + padding * 2, sh = height + padding * 2;
  const source = await scene.createTileSource(layers.filter(layer => layer.visible !== false), size, options);
  const sampler = new TileSampler(source, 16 * 1024 * 1024);
  try {
    signal.throwIfAborted();
    const pixels = new Float32Array(sw * sh * 4);
    const originX = Math.floor((center.lonDeg + 180) / 360 * (size * 2) - 0.5) - width / 2 - padding;
    const originY = Math.floor((0.5 - center.latDeg / 180) * size - 0.5) - height / 2 - padding;
    const sin = new Float64Array(sw), cos = new Float64Array(sw);
    for (let x = 0; x < sw; x++) {
      const gx = ((originX + x) % (size * 2) + size * 2) % (size * 2);
      const lon = (gx + 0.5) / (size * 2) * Math.PI * 2 - Math.PI;
      sin[x] = Math.sin(lon); cos[x] = Math.cos(lon);
    }
    for (let y = 0; y < sh; y++) {
      if (y % 8 === 0) {
        signal.throwIfAborted(); progress(y / sh);
        await new Promise(resolve => setTimeout(resolve, 0));
        signal.throwIfAborted();
      }
      const gy = Math.max(0, Math.min(size - 1, originY + y));
      const lat = (0.5 - (gy + 0.5) / size) * Math.PI;
      const cl = Math.cos(lat), sl = Math.sin(lat);
      for (let x = 0; x < sw; x++) sampler.sampleDirection(cl * sin[x], sl, -cl * cos[x], pixels, (y * sw + x) * 4);
    }
    signal.throwIfAborted(); progress(1);
    return { pixels, width, height, padding, exportHeight: size };
  } finally { sampler.clear(); source.dispose(); }
}

/** The extra halo makes this crop identical to filtering those pixels in the full panorama. */
export function compareHdrPreview(data: HdrPreviewData, amount: number) {
  const { width, height, padding, pixels, exportHeight } = data;
  const sw = width + padding * 2, sh = height + padding * 2;
  const native = new Float32Array(width * height * 4), softened = new Float32Array(native.length);
  const read = (y: number, out: Float32Array) => out.set(pixels.subarray(y * sw * 4, (y + 1) * sw * 4));
  const filtered = softenPanorama(read, sw, sh, amount, exportHeight);
  const row = new Float32Array(sw * 4);
  for (let y = 0; y < height; y++) {
    const sy = y + padding;
    native.set(pixels.subarray((sy * sw + padding) * 4, (sy * sw + padding + width) * 4), y * width * 4);
    filtered(sy, row); softened.set(row.subarray(padding * 4, (padding + width) * 4), y * width * 4);
  }
  return { native, softened };
}

/** Exposure/tone mapping are display-only; source radiance remains unchanged. */
export function hdrPreviewBytes(pixels: Float32Array, exposure: number, mapping: 'reinhard' | 'linear') {
  const out = new Uint8ClampedArray(pixels.length), gain = 2 ** exposure;
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = Math.max(0, pixels[i + c]) * gain;
      const display = Number.isFinite(v) ? (mapping === 'reinhard' ? v / (1 + v) : Math.min(1, v)) : (v > 0 ? 1 : 0);
      out[i + c] = Math.round(255 * Math.pow(display, 1 / 2.2));
    }
    out[i + 3] = 255;
  }
  return out;
}
