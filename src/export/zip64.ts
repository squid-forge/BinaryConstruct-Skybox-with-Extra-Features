import type { ByteSink } from './streamEncoders';

const CRC = Uint32Array.from({ length: 256 }, (_, i) => {
  let n = i;
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n;
});

function updateCrc(crc: number, data: Uint8Array): number {
  for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ CRC[(crc ^ data[i]) & 255];
  return crc;
}
const FLAGS = 0x0808; // UTF-8 names + streaming data descriptor.
const DATE = 0x5021;  // 2020-01-01: stable archive timestamps.
interface Entry { name: Uint8Array; size: bigint; offset: bigint; crc: number }
function record(size: number) { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; }

export function zip64LocalHeader(name: Uint8Array): Uint8Array {
  const { bytes, view: v } = record(30 + name.length + 20);
  v.setUint32(0, 0x04034b50, true); v.setUint16(4, 45, true); v.setUint16(6, FLAGS, true);
  v.setUint16(12, DATE, true); v.setUint32(18, 0xffffffff, true); v.setUint32(22, 0xffffffff, true);
  v.setUint16(26, name.length, true); v.setUint16(28, 20, true); bytes.set(name, 30);
  const extra = 30 + name.length; v.setUint16(extra, 1, true); v.setUint16(extra + 2, 16, true);
  // Unknown sizes are zero in the local ZIP64 extra; the descriptor and central directory supply them.
  return bytes;
}
export function zip64Descriptor(crc: number, size: bigint): Uint8Array {
  const { bytes, view: v } = record(24);
  v.setUint32(0, 0x08074b50, true); v.setUint32(4, crc, true);
  v.setBigUint64(8, size, true); v.setBigUint64(16, size, true); return bytes;
}
export function zip64CentralHeader(entry: Entry): Uint8Array {
  const { name, size, offset, crc } = entry;
  const { bytes, view: v } = record(46 + name.length + 28);
  v.setUint32(0, 0x02014b50, true); v.setUint16(4, 45, true); v.setUint16(6, 45, true);
  v.setUint16(8, FLAGS, true); v.setUint16(14, DATE, true); v.setUint32(16, crc, true);
  v.setUint32(20, 0xffffffff, true); v.setUint32(24, 0xffffffff, true);
  v.setUint16(28, name.length, true); v.setUint16(30, 28, true); v.setUint32(42, 0xffffffff, true);
  bytes.set(name, 46); const extra = 46 + name.length;
  v.setUint16(extra, 1, true); v.setUint16(extra + 2, 24, true);
  v.setBigUint64(extra + 4, size, true); v.setBigUint64(extra + 12, size, true); v.setBigUint64(extra + 20, offset, true);
  return bytes;
}
export function zip64EndRecords(count: bigint, directorySize: bigint, directoryOffset: bigint): Uint8Array {
  const { bytes, view: v } = record(56 + 20 + 22);
  v.setUint32(0, 0x06064b50, true); v.setBigUint64(4, 44n, true);
  v.setUint16(12, 45, true); v.setUint16(14, 45, true);
  v.setBigUint64(24, count, true); v.setBigUint64(32, count, true);
  v.setBigUint64(40, directorySize, true); v.setBigUint64(48, directoryOffset, true);
  v.setUint32(56, 0x07064b50, true); v.setBigUint64(64, directoryOffset + directorySize, true); v.setUint32(72, 1, true);
  v.setUint32(76, 0x06054b50, true); v.setUint16(84, 0xffff, true); v.setUint16(86, 0xffff, true);
  v.setUint32(88, 0xffffffff, true); v.setUint32(92, 0xffffffff, true);
  return bytes;
}

/** STORE-mode ZIP64 with CRC32, 64-bit sizes/offsets and awaited sink backpressure.
 * Only central-directory metadata is retained; entry data is never accumulated.
 */
export class Zip64Stream {
  private readonly entries: Entry[] = [];
  private position = 0n;
  private busy = false;
  private closed = false;
  private failed = false;
  private readonly sink: ByteSink;
  constructor(sink: ByteSink) { this.sink = sink; }
  private async write(data: Uint8Array) {
    if (this.closed) throw new Error('Archive is closed');
    await this.sink(data); this.position += BigInt(data.length);
  }
  async entry(filename: string, encode: (sink: ByteSink) => Promise<void>) {
    if (this.busy || this.closed || this.failed) throw new Error('Archive is not ready for an entry');
    const name = new TextEncoder().encode(filename);
    if (!name.length || name.length > 65535 || filename.includes('\\') || filename.includes('\0') || filename.startsWith('/') || /^[A-Za-z]:/.test(filename) || filename.split('/').some(p => p === '..' || p === '.')) throw new Error('Invalid archive entry name');
    this.busy = true;
    let size = 0n, crc = 0xffffffff;
    const offset = this.position;
    try {
      await this.write(zip64LocalHeader(name));
      await encode(async data => {
        crc = updateCrc(crc, data); size += BigInt(data.length);
        await this.write(data);
      });
      crc = (crc ^ 0xffffffff) >>> 0;
      await this.write(zip64Descriptor(crc, size));
      this.entries.push({ name, size, offset, crc });
    } catch (error) { this.failed = true; throw error; }
    finally { this.busy = false; }
  }
  async finish() {
    if (this.busy || this.closed || this.failed) throw new Error('Cannot finish an incomplete archive');
    try {
      const start = this.position;
      for (const entry of this.entries) await this.write(zip64CentralHeader(entry));
      await this.write(zip64EndRecords(BigInt(this.entries.length), this.position - start, start));
      this.closed = true;
    } catch (error) { this.failed = true; throw error; }
  }
  abort() { this.closed = true; this.entries.length = 0; }
}
