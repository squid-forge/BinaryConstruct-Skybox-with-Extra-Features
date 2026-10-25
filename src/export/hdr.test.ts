import { describe, expect, it } from 'vitest';
import { encodeRadianceHdr } from './hdr';

async function body(data: Float32Array, width: number, height: number) {
  const bytes = new Uint8Array(await encodeRadianceHdr(data, width, height).arrayBuffer());
  const header = new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`);
  expect(bytes.subarray(0, header.length)).toEqual(header);
  return bytes.subarray(header.length);
}

describe('Radiance export', () => {
  it('preserves scanline RLE through the maximum valid width', async () => {
    for (const width of [8, 16384, 32767]) {
      const bytes = await body(new Float32Array(width * 4), width, 1);
      expect([...bytes.subarray(0, 4)]).toEqual([2, 2, width >> 8, width & 255]);
      // Black rows are compressed into runs of at most 127 pixels per channel.
      expect(bytes.length).toBe(4 + 4 * 2 * Math.ceil(width / 127));
    }
  });

  it('writes flat RGBE at 32768 pixels, without an invalid RLE header', async () => {
    const width = 32768;
    const data = new Float32Array(width * 4 * 2);
    data[0] = 1; // bottom row: red
    data[width * 4 + 1] = 1; // top row: green
    const bytes = await body(data, width, 2);
    expect(bytes.length).toBe(width * 2 * 4);
    expect([...bytes.subarray(0, 4)]).toEqual([0, 128, 0, 129]);
    expect([...bytes.subarray(width * 4, width * 4 + 4)]).toEqual([128, 0, 0, 129]);
  });
});
