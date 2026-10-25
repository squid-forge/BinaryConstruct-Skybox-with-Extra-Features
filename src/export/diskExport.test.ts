import { expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { DiskExportJob, DiskFile, DiskZip } from './diskExport';

it('streams archives to a file with backpressure and preserves large entry payloads', async () => {
  const written: ArrayBuffer[] = [];
  let outstanding = 0, peakOutstanding = 0, closed = false;
  const writer = {
    async write(chunk: ArrayBuffer) {
      outstanding++; peakOutstanding = Math.max(peakOutstanding, outstanding);
      await Promise.resolve(); written.push(chunk.slice(0)); outstanding--;
    },
    async close() { closed = true; }, async abort() {},
  } as unknown as FileSystemWritableFileStream;
  const handle = { async getFile() { return new File(written, 'archive.zip'); } } as FileSystemFileHandle;
  const zip = new DiskZip(new DiskFile(handle, writer));
  const block = Uint8Array.from({ length: 65536 }, (_, i) => i & 255);
  await zip.entry('large.bin', async (sink) => { for (let i = 0; i < 40; i++) await sink(block); });
  await zip.entry('metadata.json', (sink) => sink(new TextEncoder().encode('{"ok":true}')));
  const file = await zip.finish();
  expect(closed).toBe(true); expect(peakOutstanding).toBe(1);
  expect(Math.max(...written.map((chunk) => chunk.byteLength))).toBeLessThan(1200000);
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  expect(entries['large.bin'].length).toBe(block.length * 40);
  expect(entries['large.bin'].subarray(-block.length)).toEqual(block);
  expect(new TextDecoder().decode(entries['metadata.json'])).toBe('{"ok":true}');
});


it('owns buffered bytes when an encoder reuses its input array', async () => {
  const chunks: ArrayBuffer[] = [];
  const writer = { async write(data: ArrayBuffer) { chunks.push(data.slice(0)); }, async close() {}, async abort() {} } as unknown as FileSystemWritableFileStream;
  const handle = { async getFile() { return new File(chunks, 'reused.bin'); } } as FileSystemFileHandle;
  const file = new DiskFile(handle, writer), buffer = new Uint8Array([1, 2, 3]);
  await file.write(buffer); buffer.fill(9); await file.write(buffer);
  expect(new Uint8Array(await (await file.finish()).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 9, 9, 9]));
  expect(file.isComplete).toBe(true);
});

it('writes into its own selected subfolder and removes only incomplete outputs', async () => {
  const removed: string[] = [], created: string[] = [], aborted: string[] = [];
  const directory = {
    async getFileHandle(name: string) {
      created.push(name);
      return { async createWritable() { return { async write() {}, async close() {}, async abort() { aborted.push(name); } }; }, async getFile() { return new File([], name); } };
    },
    async removeEntry(name: string) { removed.push(name); },
  };
  let folder = '';
  const root = {
    async getDirectoryHandle(name: string) { folder = name; return directory; },
    async removeEntry() { throw Error('Must retain folder with completed files'); },
  } as unknown as FileSystemDirectoryHandle;
  // Works without navigator.storage: selected-directory output bypasses OPFS.
  const job = await DiskExportJob.create(root);
  expect(job.outputFolder).toBe(folder); expect(folder).toMatch(/^skybox-/);
  const complete = await job.open('complete.hdr'); await complete.write(new Uint8Array([1])); await complete.finish();
  await job.open('unfinished.zip');
  await job.dispose();
  expect(created).toEqual(['complete.hdr', 'unfinished.zip']);
  expect(removed).toEqual(['unfinished.zip']); expect(aborted).toEqual(['unfinished.zip']);
});
