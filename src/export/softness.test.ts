import { describe, expect, it } from 'vitest';
import { DEFAULT_HDR_SOFTNESS, softenPanorama, softnessRadius } from './softness';
import type { RowReader } from './streamEncoders';

describe('linear HDR panorama softness', () => {
  it('leaves native data untouched at zero', () => {
    const read: RowReader = () => {};
    expect(softenPanorama(read, 8, 4, 0)).toBe(read);
  });
  it('defaults to no blur at every supported export size', () => {
    const read: RowReader = () => {};
    expect(DEFAULT_HDR_SOFTNESS).toBe(0);
    for (const height of [512, 1024, 2048, 4096, 8192, 16384]) {
      expect(softnessRadius(height, DEFAULT_HDR_SOFTNESS)).toBe(0);
      expect(softenPanorama(read, height * 2, height, DEFAULT_HDR_SOFTNESS)).toBe(read);
    }
    expect(softnessRadius(16384, 1) * 2 + 1).toBe(39);
  });
  it('preserves HDR constants and alpha through sequential and random reads', () => {
    const read: RowReader = (_, out) => out.fill(32);
    const soft = softenPanorama(read, 8, 2048, 4);
    const out = new Float32Array(32);
    for (const y of [0, 1, 2, 7, 3, 4]) {
      soft(y, out);
      expect(out[0]).toBeCloseTo(32);
      expect(out[30]).toBeCloseTo(32);
      expect(out[3]).toBe(1);
    }
  });
  it('uses bounded source rows and matches random access at high resolution', () => {
    let reads = 0;
    const read: RowReader = (y, out) => { reads++; out.fill(0); if (y === 1024) out[0] = 64; };
    const soft = softenPanorama(read, 8, 2048, 1);
    const out = new Float32Array(32);
    let energy = 0, center = 0;
    for (let y = 0; y < 2048; y++) { soft(y, out); for (let x = 0; x < 8; x++) energy += out[x * 4]; if (y === 1024) center = out[0]; }
    expect(reads).toBeLessThan(2060);
    expect(energy).toBeCloseTo(64);
    expect(center).toBeGreaterThan(0); expect(center).toBeLessThan(64);
    soft(1024, out); expect(out[0]).toBeCloseTo(center);
    expect(out[28]).toBeGreaterThan(0);
  });
});
