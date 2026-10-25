import { Zlib } from 'fflate';
import { DataUtils } from 'three';
import { rleChannel, toRgbe } from './hdr';

export type ByteSink = (data: Uint8Array) => Promise<void>;
export type RowReader = (y: number, rgba: Float32Array) => void;
export interface EncodeOptions { signal: AbortSignal; progress: (row: number, total: number) => void }

const text = (s: string) => new TextEncoder().encode(s);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  return c;
});

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(data.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(text(type), 4); chunk.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < chunk.length - 4; i++) crc = CRC_TABLE[(crc ^ chunk[i]) & 255] ^ (crc >>> 8);
  view.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0);
  return chunk;
}

async function yieldProgress(y: number, height: number, options: EncodeOptions) {
  options.signal.throwIfAborted();
  options.progress(y, height);
  // Release the main thread for rendering, controls and cancellation.
  await new Promise((resolve) => setTimeout(resolve, 0));
  options.signal.throwIfAborted();
}

/** PNG with Sub-filtered RGB scanlines. At most 16 rows and one zlib push live. */
export async function streamPng(width: number, height: number, read: RowReader, sink: ByteSink, options: EncodeOptions) {
  await sink(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  const ihdr = new Uint8Array(13);
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, width); header.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 2;
  await sink(pngChunk('IHDR', ihdr));
  const pending: Uint8Array[] = [];
  const compressor = new Zlib({ level: 3 }, (data) => { if (data.length) pending.push(pngChunk('IDAT', data)); });
  const row = new Float32Array(width * 4);
  for (let y = 0; y < height; y += 16) {
    await yieldProgress(y, height, options);
    const rows = Math.min(16, height - y);
    const filtered = new Uint8Array((width * 3 + 1) * rows);
    for (let r = 0; r < rows; r++) {
      read(y + r, row);
      let o = r * (width * 3 + 1);
      filtered[o++] = 1;
      let red = 0, green = 0, blue = 0;
      for (let x = 0; x < width; x++) {
        const i = x * 4;
        const nr = Math.max(0, Math.min(255, Math.round(row[i] * 255)));
        const ng = Math.max(0, Math.min(255, Math.round(row[i + 1] * 255)));
        const nb = Math.max(0, Math.min(255, Math.round(row[i + 2] * 255)));
        filtered[o++] = nr - red; filtered[o++] = ng - green; filtered[o++] = nb - blue;
        red = nr; green = ng; blue = nb;
      }
    }
    compressor.push(filtered, y + rows === height);
    for (const chunk of pending.splice(0)) await sink(chunk);
  }
  await sink(pngChunk('IEND', new Uint8Array()));
  options.progress(height, height);
}

export async function streamHdr(width: number, height: number, read: RowReader, sink: ByteSink, options: EncodeOptions) {
  await sink(text(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`));
  const row = new Float32Array(width * 4), rgbe = new Uint8Array(width * 4), channel = new Uint8Array(width);
  for (let y = 0; y < height; y += 16) {
    await yieldProgress(y, height, options);
    const chunks: Uint8Array[] = [];
    for (let r = y; r < Math.min(y + 16, height); r++) {
      read(r, row);
      for (let x = 0; x < width; x++) toRgbe(row[x * 4], row[x * 4 + 1], row[x * 4 + 2], rgbe, x * 4);
      if (width < 8 || width >= 32768) chunks.push(rgbe.slice());
      else {
        const bytes = [2, 2, width >> 8, width & 255];
        for (let c = 0; c < 4; c++) {
          for (let x = 0; x < width; x++) channel[x] = rgbe[x * 4 + c];
          rleChannel(channel, bytes);
        }
        chunks.push(new Uint8Array(bytes));
      }
    }
    for (const chunk of chunks) await sink(chunk);
  }
  options.progress(height, height);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
function le32(value: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, value, true); return b; }
function attribute(name: string, type: string, value: Uint8Array) { return concat(text(name + '\0'), text(type + '\0'), le32(value.length), value); }

/** Standard uncompressed scanline OpenEXR, planar half-float RGBA, disk streamed. */
export async function streamExr(width: number, height: number, read: RowReader, sink: ByteSink, options: EncodeOptions) {
  const channels = concat(...['B', 'G', 'R', 'A'].map((name) => concat(text(name + '\0'), le32(1), new Uint8Array(4), le32(1), le32(1))), new Uint8Array(1));
  const box = concat(le32(0), le32(0), le32(width - 1), le32(height - 1));
  const one = new Uint8Array(4); new DataView(one.buffer).setFloat32(0, 1, true);
  const header = concat(le32(20000630), le32(2),
    attribute('channels', 'chlist', channels), attribute('compression', 'compression', new Uint8Array([0])),
    attribute('dataWindow', 'box2i', box), attribute('displayWindow', 'box2i', box),
    attribute('lineOrder', 'lineOrder', new Uint8Array([0])), attribute('pixelAspectRatio', 'float', one),
    attribute('screenWindowCenter', 'v2f', new Uint8Array(8)), attribute('screenWindowWidth', 'float', one), new Uint8Array(1));
  await sink(header);
  const lineBytes = width * 8 + 8;
  const table = new Uint8Array(height * 8), offsets = new DataView(table.buffer);
  for (let y = 0; y < height; y++) offsets.setBigUint64(y * 8, BigInt(header.length + table.length + y * lineBytes), true);
  await sink(table);
  const row = new Float32Array(width * 4);
  for (let y = 0; y < height; y += 16) {
    await yieldProgress(y, height, options);
    const rows = Math.min(16, height - y);
    const chunk = new Uint8Array(rows * lineBytes), view = new DataView(chunk.buffer);
    for (let r = 0; r < rows; r++) {
      read(y + r, row);
      let o = r * lineBytes;
      view.setInt32(o, y + r, true); view.setUint32(o + 4, width * 8, true); o += 8;
      for (const channel of [2, 1, 0, 3]) for (let x = 0; x < width; x++) {
        view.setUint16(o, DataUtils.toHalfFloat(row[x * 4 + channel]), true); o += 2;
      }
    }
    await sink(chunk);
  }
  options.progress(height, height);
}
