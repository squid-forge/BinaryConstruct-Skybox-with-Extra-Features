import { it, expect } from 'vitest';
import { open, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Zip64Stream } from './zip64';

// Explicit opt-in: writes a real >4-GiB archive to disk, verifies it independently,
// and removes that exact temporary artifact. Not part of routine unit gates.
it.skipIf(process.env.ZIP64_LARGE_TEST !== '1')('roundtrips a real entry beyond 4 GiB through Python zipfile', async () => {
  const path = 'Docs/Research/2026-10-25-package-fixes/zip64-large-verification.zip';
  const file = await open(path, 'wx');
  try {
    const zip = new Zip64Stream(async data => {
      let offset = 0;
      while (offset < data.length) { const { bytesWritten } = await file.write(data, offset, data.length - offset); offset += bytesWritten; }
    });
    const block = new Uint8Array(1024 * 1024);
    await zip.entry('over-4gib.bin', async sink => { for (let i = 0; i < 4097; i++) await sink(block); });
    await zip.entry('after-boundary.txt', sink => sink(new TextEncoder().encode('valid')));
    await zip.finish(); await file.close();
    const result = spawnSync('python', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.getinfo("over-4gib.bin").file_size==4097*1024*1024; assert z.getinfo("after-boundary.txt").header_offset>2**32; assert z.read("after-boundary.txt")==b"valid"; assert z.testzip() is None; print("ZIP64 >4 GiB CRC and offset verification passed")', path], { timeout: 180000 });
    expect(result.status, result.stderr?.toString()).toBe(0);
    console.log(result.stdout.toString().trim());
  } finally { await file.close().catch(() => {}); await unlink(path); }
}, 300000);
