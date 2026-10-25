import { halfToFloat } from './hdr';

export interface TileSource {
  size: number;
  tileSize: number;
  /** Top-down RGBA half floats; edge tiles retain tileSize row stride. */
  render(face: number, x: number, y: number): Uint16Array;
  dispose(): void;
}

// One lookup replaces expensive half-float exponent calculations per sample.
const HALF = Float32Array.from({ length: 65536 }, (_, i) => halfToFloat(i));

/** Bounded LRU. No full face/image buffers, independent of output resolution. */
export class TileSampler {
  private readonly cache = new Map<number, Uint16Array>();
  private readonly across: number;
  private lastKey = -1;
  private lastTile?: Uint16Array;
  readonly capacity: number;
  readonly source: TileSource;

  constructor(source: TileSource, budgetBytes = (source.size >= 16384 ? 192 : source.size >= 8192 ? 96 : 32) * 1024 * 1024) {
    this.source = source;
    this.across = Math.ceil(source.size / source.tileSize);
    this.capacity = Math.max(4, Math.floor(budgetBytes / (source.tileSize ** 2 * 8)));
  }

  get cachedBytes(): number { return this.cache.size * this.source.tileSize ** 2 * 8; }
  clear(): void { this.cache.clear(); this.lastKey = -1; this.lastTile = undefined; }

  private pixel(face: number, x: number, y: number): number {
    const { size, tileSize } = this.source;
    // A bilinear footprint may cross a cube edge. Fetch its neighbouring face
    // rather than clamping to the current face and leaving a visible seam.
    if (x < 0 || y < 0 || x >= size || y >= size) {
      const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1;
      let dx: number, dy: number, dz: number;
      switch (face) {
        case 0: dx = 1; dy = v; dz = -u; break;
        case 1: dx = -1; dy = v; dz = u; break;
        case 2: dx = u; dy = 1; dz = -v; break;
        case 3: dx = u; dy = -1; dz = v; break;
        case 4: dx = u; dy = v; dz = 1; break;
        default: dx = -u; dy = v; dz = -1;
      }
      const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
      let major: number, su: number, sv: number;
      if (ax >= ay && ax >= az) { face = dx >= 0 ? 0 : 1; major = ax; su = dx >= 0 ? -dz : dz; sv = dy; }
      else if (ay >= az) { face = dy >= 0 ? 2 : 3; major = ay; su = dx; sv = dy >= 0 ? -dz : dz; }
      else { face = dz >= 0 ? 4 : 5; major = az; su = dz >= 0 ? dx : -dx; sv = dy; }
      x = Math.floor((su / major + 1) * size / 2);
      y = Math.floor((sv / major + 1) * size / 2);
    }
    x = Math.max(0, Math.min(size - 1, x));
    y = Math.max(0, Math.min(size - 1, y));
    const tx = Math.floor(x / tileSize);
    const ty = Math.floor(y / tileSize);
    const key = (face * this.across + ty) * this.across + tx;
    if (key !== this.lastKey) {
      let tile = this.cache.get(key);
      if (tile) this.cache.delete(key);
      else {
        if (this.cache.size >= this.capacity) this.cache.delete(this.cache.keys().next().value!);
        tile = this.source.render(face, tx * tileSize, ty * tileSize);
      }
      this.cache.set(key, tile);
      this.lastKey = key;
      this.lastTile = tile;
    }
    return ((y % tileSize) * tileSize + x % tileSize) * 4;
  }

  faceRow(face: number, y: number, out: Float32Array): void {
    for (let x = 0; x < this.source.size; x++) {
      const offset = this.pixel(face, x, y), tile = this.lastTile!;
      for (let c = 0; c < 3; c++) out[x * 4 + c] = HALF[tile[offset + c]];
      out[x * 4 + 3] = 1;
    }
  }

  /** GL cube orientation, expressed in top-down image coordinates. */
  sampleDirection(x: number, y: number, z: number, out: Float32Array, offset: number): void {
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    let face: number, u: number, v: number, major: number;
    if (ax >= ay && ax >= az) {
      face = x >= 0 ? 0 : 1; major = ax; u = x >= 0 ? -z : z; v = y;
    } else if (ay >= az) {
      face = y >= 0 ? 2 : 3; major = ay; u = x; v = y >= 0 ? -z : z;
    } else {
      face = z >= 0 ? 4 : 5; major = az; u = z >= 0 ? x : -x; v = y;
    }
    const px = (u / major + 1) * this.source.size / 2 - 0.5;
    const py = (v / major + 1) * this.source.size / 2 - 0.5;
    const ix = Math.floor(px), iy = Math.floor(py);
    const fx = px - ix, fy = py - iy;
    const ai = this.pixel(face, ix, iy), a = this.lastTile!;
    let b: Uint16Array, c: Uint16Array, d: Uint16Array, bi: number, ci: number, di: number;
    const { size, tileSize } = this.source;
    if (ix >= 0 && iy >= 0 && ix + 1 < size && iy + 1 < size && ix % tileSize < tileSize - 1 && iy % tileSize < tileSize - 1) {
      b = c = d = a; bi = ai + 4; ci = ai + tileSize * 4; di = ci + 4;
    } else {
      bi = this.pixel(face, ix + 1, iy); b = this.lastTile!;
      ci = this.pixel(face, ix, iy + 1); c = this.lastTile!;
      di = this.pixel(face, ix + 1, iy + 1); d = this.lastTile!;
    }
    for (let channel = 0; channel < 3; channel++) {
      const top = HALF[a[ai + channel]] * (1 - fx) + HALF[b[bi + channel]] * fx;
      const bottom = HALF[c[ci + channel]] * (1 - fx) + HALF[d[di + channel]] * fx;
      out[offset + channel] = top * (1 - fy) + bottom * fy;
    }
    out[offset + 3] = 1;
  }
}

export function panoramaRows(sampler: TileSampler, width: number, height: number) {
  const sin = new Float64Array(width), cos = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const lon = (x + 0.5) / width * Math.PI * 2 - Math.PI;
    sin[x] = Math.sin(lon); cos[x] = Math.cos(lon);
  }
  return (y: number, out: Float32Array) => {
    const lat = (0.5 - (y + 0.5) / height) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < width; x++) sampler.sampleDirection(cl * sin[x], sl, -cl * cos[x], out, x * 4);
  };
}
