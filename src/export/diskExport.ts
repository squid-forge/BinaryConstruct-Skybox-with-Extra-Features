import { Zip64Stream } from './zip64';
import { downloadBlob } from './exporter';
import type { ByteSink } from './streamEncoders';

/** Output buffering is bounded. The completed File stays on disk, not in a Blob array. */
export class DiskFile {
  private parts: Uint8Array[] = [];
  private buffered = 0;
  private closed = false;
  private completed = false;
  get isComplete() { return this.completed; }
  private handle: FileSystemFileHandle;
  private writer: FileSystemWritableFileStream;
  constructor(handle: FileSystemFileHandle, writer: FileSystemWritableFileStream) { this.handle = handle; this.writer = writer; }
  readonly write: ByteSink = async (data) => {
    if (this.closed) throw new Error('Output file is closed');
    // A sink caller may reuse its buffer as soon as this promise resolves.
    // Own bounded copies rather than retaining caller-owned mutable arrays.
    for (let offset = 0; offset < data.length;) {
      const length = Math.min(1024 * 1024 - this.buffered, data.length - offset);
      this.parts.push(data.slice(offset, offset + length)); this.buffered += length; offset += length;
      if (this.buffered >= 1024 * 1024) await this.flush();
    }
  };
  private async flush() {
    if (!this.buffered) return;
    const chunk = new Uint8Array(this.buffered);
    let offset = 0;
    for (const part of this.parts) { chunk.set(part, offset); offset += part.length; }
    this.parts = []; this.buffered = 0;
    await this.writer.write(chunk.buffer);
  }
  async finish(): Promise<File> {
    await this.flush(); await this.writer.close(); this.closed = true; this.completed = true;
    return this.handle.getFile();
  }
  async abort() {
    this.parts = []; this.buffered = 0;
    if (!this.closed) { this.closed = true; await this.writer.abort().catch(() => {}); }
  }
}

export class DiskExportJob {
  private readonly files: Array<{ file: DiskFile; name: string }> = [];
  private delivered = false;
  private root: FileSystemDirectoryHandle;
  private directory: FileSystemDirectoryHandle;
  private name: string;
  private direct: boolean;
  get outputFolder() { return this.direct ? this.name : undefined; }
  private constructor(root: FileSystemDirectoryHandle, directory: FileSystemDirectoryHandle, name: string, direct = false) {
    this.direct = direct;
    this.root = root; this.directory = directory; this.name = name;
  }

  static async create(destination?: FileSystemDirectoryHandle): Promise<DiskExportJob> {
    const uniqueName = `skybox-${Date.now()}-${Math.trunc(performance.now() * 1000)}`;
    if (destination) return new DiskExportJob(destination, await destination.getDirectoryHandle(uniqueName, { create: true }), uniqueName, true);
    if (!navigator.storage?.getDirectory) throw new Error('Memory-saving export needs browser disk storage. Use Chrome or Edge on localhost.');
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('skybox-export-temp', { create: true });
    const iterable = root as FileSystemDirectoryHandle & { keys(): AsyncIterableIterator<string> };
    for await (const name of iterable.keys()) {
      // Only clean our own stale jobs, never recent downloads or other app data.
      const stamp = Number(name.split('-')[0]);
      if (Number.isFinite(stamp) && Date.now() - stamp > 86400000) await root.removeEntry(name, { recursive: true }).catch(() => {});
    }
    const name = `${Date.now()}-${Math.trunc(performance.now() * 1000)}`;
    return new DiskExportJob(root, await root.getDirectoryHandle(name, { create: true }), name);
  }

  async open(filename?: string): Promise<DiskFile> {
    const requested = filename ?? `output-${this.files.length}`;
    const safeName = [...requested].map(c => c.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(c) ? '_' : c).join('');
    const name = this.direct ? safeName : `${this.files.length}.tmp`;
    const handle = await this.directory.getFileHandle(name, { create: true });
    const file = new DiskFile(handle, await handle.createWritable());
    this.files.push({ file, name }); return file;
  }
  download(name: string, file: File) { this.delivered = true; if (!this.direct) downloadBlob(name, file); }
  async dispose() {
    for (const { file, name } of this.files) {
      await file.abort();
      if (this.direct && !file.isComplete) await this.directory.removeEntry(name).catch(() => {});
    }
    if (this.direct && this.files.some(({ file }) => file.isComplete)) return;
    const remove = () => this.root.removeEntry(this.name, { recursive: true }).catch(() => {});
    // Keep disk-backed URLs/files available while the browser starts downloads.
    if (this.delivered) setTimeout(() => { void remove(); }, 120000);
    else await remove();
  }
}

/** ZIP64 archive output: entry sizes and directory offsets may exceed 4 GiB. */
export class DiskZip {
  private readonly zip: Zip64Stream;
  private readonly file: DiskFile;
  constructor(file: DiskFile) { this.file = file; this.zip = new Zip64Stream(file.write); }
  entry(name: string, encode: (sink: ByteSink) => Promise<void>) { return this.zip.entry(name, encode); }
  async finish(): Promise<File> { await this.zip.finish(); return this.file.finish(); }
  abort() { this.zip.abort(); }
}

/** Call synchronously from the export button gesture, before importing encoders. */
export function chooseExportDirectory(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as Window & { showDirectoryPicker?: (options: { mode: string; id: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  if (!picker) return Promise.reject(new Error('Direct folder export needs a browser with directory access, such as Chrome or Edge.'));
  return picker.call(window, { mode: 'readwrite', id: 'skybox-export' });
}
