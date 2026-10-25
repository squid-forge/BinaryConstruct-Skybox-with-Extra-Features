import { describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { FloatType } from 'three';
import { streamExr, streamHdr, streamPng, type ByteSink, type EncodeOptions, type RowReader } from './streamEncoders';
import { encodeRadianceHdr } from './hdr';

const options = (): EncodeOptions => ({ signal: new AbortController().signal, progress: () => {} });
const read: RowReader = (y, rgba) => {
  for (let x = 0; x < rgba.length / 4; x++) rgba.set([x % 2, y / 2, 0.25, 1], x * 4);
};
async function collect(encode: (sink: ByteSink) => Promise<void>) {
  const chunks: Uint8Array[] = [];
  await encode(async (data) => { chunks.push(data.slice()); });
  return new Uint8Array(await new Blob(chunks.map((c) => c.buffer as ArrayBuffer)).arrayBuffer());
}

describe('streaming encoders', () => {
  it('writes a decodable RGB PNG across multiple zlib input blocks', async () => {
    const width = 17, height = 35;
    const png = await collect((sink) => streamPng(width, height, read, sink, options()));
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer);
    expect(view.getUint32(16)).toBe(width); expect(view.getUint32(20)).toBe(height);
    const idat: Uint8Array[] = [];
    for (let o = 8; o < png.length;) {
      const size = view.getUint32(o);
      if (new TextDecoder().decode(png.subarray(o + 4, o + 8)) === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + size));
      o += size + 12;
    }
    const filtered = unzlibSync(new Uint8Array(await new Blob(idat.map((c) => c.slice().buffer)).arrayBuffer()));
    expect(filtered.length).toBe((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
      const o = y * (width * 3 + 1);
      expect(filtered[o]).toBe(1);
      let r = 0, g = 0, b = 0;
      for (let x = 0; x < width; x++) {
        r = (r + filtered[o + x * 3 + 1]) & 255;
        g = (g + filtered[o + x * 3 + 2]) & 255;
        b = (b + filtered[o + x * 3 + 3]) & 255;
        expect([r, g, b]).toEqual([x % 2 * 255, Math.min(255, Math.round(y / 2 * 255)), 64]);
      }
    }
  });

  it('matches the existing Radiance encoder, including the 32768 width boundary', async () => {
    for (const width of [4, 32, 32768]) {
      const height = 2, full = new Float32Array(width * height * 4);
      read(1, full.subarray(0, width * 4)); read(0, full.subarray(width * 4));
      const expected = new Uint8Array(await encodeRadianceHdr(full, width, height).arrayBuffer());
      expect(await collect((sink) => streamHdr(width, height, read, sink, options()))).toEqual(expected);
    }
  });

  it('loads the streamed half-float EXR with the independent three.js loader', async () => {
    const bytes = await collect((sink) => streamExr(3, 2, read, sink, options()));
    const exr = new EXRLoader().setDataType(FloatType).parse(bytes.buffer as ArrayBuffer);
    expect([exr.width, exr.height]).toEqual([3, 2]);
    // EXRLoader returns bottom-up pixels, while file scanlines are top-down.
    expect([...exr.data!.slice(0, 8)]).toEqual([0, 0.5, 0.25, 1, 1, 0.5, 0.25, 1]);
    expect([...exr.data!.slice(12, 16)]).toEqual([0, 0, 0.25, 1]);
  });

  it('stops before reading pixels when cancelled', async () => {
    const abort = new AbortController(); abort.abort();
    let readCount = 0;
    await expect(streamPng(16, 16, () => { readCount++; }, async () => {}, { signal: abort.signal, progress: () => {} })).rejects.toThrow();
    expect(readCount).toBe(0);
  });
});
