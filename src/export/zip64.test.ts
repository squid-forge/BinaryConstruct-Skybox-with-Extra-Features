import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { spawnSync } from 'node:child_process';
import { Zip64Stream, zip64CentralHeader, zip64Descriptor, zip64EndRecords } from './zip64';

async function archive() {
  const chunks: Uint8Array[] = [];
  const zip = new Zip64Stream(async data => { chunks.push(data.slice()); });
  await zip.entry('nebula/cloud.txt', async sink => {
    const buffer = new Uint8Array([1, 2, 3]); await sink(buffer); buffer.fill(9); await sink(buffer);
  });
  await zip.entry('stars-\u03b1.json', async sink => { await sink(new TextEncoder().encode('{"stars":3}')); });
  await zip.entry('empty', async () => {});
  await zip.finish();
  return new Uint8Array(await new Blob(chunks.map(c => c.buffer as ArrayBuffer)).arrayBuffer());
}
describe('streaming ZIP64', () => {
  it('is readable by independent ZIP readers, with correct CRC, Unicode and empty entries', async () => {
    const data = await archive(), entries = unzipSync(data);
    expect(entries['nebula/cloud.txt']).toEqual(new Uint8Array([1, 2, 3, 9, 9, 9]));
    expect(new TextDecoder().decode(entries['stars-\u03b1.json'])).toBe('{"stars":3}');
    expect(entries.empty.length).toBe(0);
    if (spawnSync('python', ['--version']).status !== 0) return;
    const result = spawnSync('python', ['-c', 'import io,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; assert z.read("nebula/cloud.txt")==bytes([1,2,3,9,9,9]); print(len(z.infolist()))'], { input: data });
    expect(result.status, result.stderr.toString()).toBe(0); expect(result.stdout.toString().trim()).toBe('3');
  });
  it('encodes sizes, offsets and entry counts above ZIP32 limits without truncation', () => {
    const size = 0x100000001n, offset = 0x200000003n, count = 70000n;
    const name = new TextEncoder().encode('big.exr');
    const central = zip64CentralHeader({ name, size, offset, crc: 0x12345678 });
    const cv = new DataView(central.buffer), extra = 46 + name.length;
    expect(cv.getUint32(20, true)).toBe(0xffffffff);
    expect(cv.getBigUint64(extra + 4, true)).toBe(size);
    expect(cv.getBigUint64(extra + 20, true)).toBe(offset);
    const descriptor = new DataView(zip64Descriptor(5, size).buffer);
    expect(descriptor.getBigUint64(8, true)).toBe(size);
    const end = new DataView(zip64EndRecords(count, size, offset).buffer);
    expect(end.getBigUint64(32, true)).toBe(count);
    expect(end.getBigUint64(40, true)).toBe(size);
    expect(end.getBigUint64(48, true)).toBe(offset);
    expect(end.getBigUint64(64, true)).toBe(offset + size);
  });
  it('is byte deterministic and refuses incomplete or unsafe archives', async () => {
    expect(await archive()).toEqual(await archive());
    const zip = new Zip64Stream(async () => {});
    await expect(zip.entry('../outside', async () => {})).rejects.toThrow('Invalid archive entry');
    await expect(zip.entry('failed', async () => { throw Error('cancelled'); })).rejects.toThrow('cancelled');
    await expect(zip.finish()).rejects.toThrow('incomplete');
  });
});
