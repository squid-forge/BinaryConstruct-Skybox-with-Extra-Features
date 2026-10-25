import { describe, expect, it } from 'vitest';
import { DataUtils } from 'three';
import { panoramaRows, TileSampler, type TileSource } from './tiles';

function source(size = 16): TileSource {
  return { size, tileSize: 4, dispose() {}, render(face, x, y) {
    const tile = new Uint16Array(4 * 4 * 4);
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      tile.set([face, (x + tx) / size, (y + ty) / size, 1].map(DataUtils.toHalfFloat), (ty * 4 + tx) * 4);
    }
    return tile;
  } };
}

describe('bounded cube tile sampling', () => {
  it('maps the six canonical cube directions and interpolates pixel centres', () => {
    const sampler = new TileSampler(source());
    const row = new Float32Array(4);
    const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [face, [x, y, z]] of axes.entries()) {
      sampler.sampleDirection(x, y, z, row, 0);
      expect([...row]).toEqual([face, 7.5 / 16, 7.5 / 16, 1]);
    }
    sampler.sampleDirection(1, 0.5, -0.5, row, 0);
    expect([...row]).toEqual([0, 11.5 / 16, 11.5 / 16, 1]);
  });

  it('reads cube rows top-down and never retains more than its tile budget', () => {
    const sampler = new TileSampler(source(), 4 * 4 * 8 * 4);
    const row = new Float32Array(16 * 4);
    for (let face = 0; face < 6; face++) for (let y = 0; y < 16; y++) {
      sampler.faceRow(face, y, row);
      expect([...row.slice(8 * 4, 9 * 4)]).toEqual([face, 0.5, y / 16, 1]);
      expect(sampler.cachedBytes).toBeLessThanOrEqual(4 * 4 * 8 * 4);
    }
  });

  it('orients the panorama north at the top and negative Z at its centre', () => {
    const sampler = new TileSampler(source());
    const read = panoramaRows(sampler, 16, 8), row = new Float32Array(16 * 4);
    read(0, row); expect(row[8 * 4]).toBe(2);
    read(7, row); expect(row[8 * 4]).toBe(3);
    read(4, row); expect(row[8 * 4]).toBe(5);
  });

  it('blends neighbouring cube faces across an edge', () => {
    const sampler = new TileSampler(source());
    const row = new Float32Array(4);
    sampler.sampleDirection(1, 0, 1, row, 0);
    expect(row[0]).toBe(2); // Half +X (0), half +Z (4).
  });
});
