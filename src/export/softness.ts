import type { RowReader } from './streamEncoders';

/** Preserve native detail unless the user explicitly requests smoothing. */
export const DEFAULT_HDR_SOFTNESS = 0;

/** Separable tent filter in linear radiance, with periodic longitude.
 * Amount is angular softness in pixels at 2048px panorama height.
 * Sliding sums keep work O(width * height), even at 16K. Only nearby rows
 * are retained. Alpha is render state; radiance is never clipped/tone mapped.
 */
export function softnessRadius(referenceHeight: number, amount: number): number {
  const sigma = Math.max(0, Math.min(4, amount)) * referenceHeight / 2048;
  return sigma > 0.05 ? Math.max(1, Math.round(Math.sqrt(6 * sigma * sigma + 1) - 1)) : 0;
}

export function softenPanorama(read: RowReader, width: number, height: number, amount: number, referenceHeight = height): RowReader {
  const radius = softnessRadius(referenceHeight, amount);
  if (radius === 0) return read;
  const norm = (radius + 1) ** 2;
  const cache = new Map<number, Float32Array>();
  const source = new Float32Array(width * 4);
  const weighted = new Float64Array(width * 4);
  const left = new Float64Array(width * 4), right = new Float64Array(width * 4);
  let previous = -2;
  const rowAt = (y: number): Float32Array => {
    y = Math.max(0, Math.min(height - 1, y));
    let row = cache.get(y);
    if (row) return row;
    read(y, source);
    row = new Float32Array(width * 4);
    for (let c = 0; c < 3; c++) {
      const sample = (x: number) => source[((x % width + width) % width) * 4 + c];
      let value = 0, lo = 0, hi = 0;
      for (let k = -radius; k <= radius; k++) value += sample(k) * (radius + 1 - Math.abs(k));
      for (let k = -radius; k <= 0; k++) lo += sample(k);
      for (let k = 1; k <= radius + 1; k++) hi += sample(k);
      for (let x = 0; x < width; x++) {
        row[x * 4 + c] = value / norm;
        value += hi - lo;
        lo += sample(x + 1) - sample(x - radius);
        hi += sample(x + radius + 2) - sample(x + 1);
      }
    }
    cache.set(y, row);
    return row;
  };
  return (y, out) => {
    // Encoders request sequential rows; restarting or random access is safe too.
    for (const key of cache.keys()) if (key < y - radius - 1 || key > y + radius + 1) cache.delete(key);
    if (y !== previous + 1) {
      weighted.fill(0); left.fill(0); right.fill(0);
      for (let k = -radius; k <= radius + 1; k++) {
        const row = rowAt(y + k);
        const w = Math.max(0, radius + 1 - Math.abs(k));
        for (let i = 0; i < out.length; i++) {
          weighted[i] += row[i] * w;
          if (k <= 0) left[i] += row[i];
          else right[i] += row[i];
        }
      }
    } else {
      const oldLeft = rowAt(y - 1 - radius), newLeft = rowAt(y);
      const oldRight = rowAt(y), newRight = rowAt(y + radius + 1);
      for (let i = 0; i < out.length; i++) {
        weighted[i] += right[i] - left[i];
        left[i] += newLeft[i] - oldLeft[i];
        right[i] += newRight[i] - oldRight[i];
      }
    }
    for (let i = 0; i < out.length; i++) out[i] = weighted[i] / norm;
    for (let x = 0; x < width; x++) out[x * 4 + 3] = 1;
    previous = y;
  };
}
