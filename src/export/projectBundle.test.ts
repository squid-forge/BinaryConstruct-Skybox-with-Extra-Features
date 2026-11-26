import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { buildProjectBundle, checkProjectBundleSize, openProjectBundle } from './projectBundle';
import type { SpriteAsset } from '../assets/spriteStore';

function asset(fileName: string, occludes: boolean): SpriteAsset {
  return {
    id: `user:${fileName}`,
    fileName,
    data: new Uint8Array([1, 2, 3]),
    mime: 'image/png',
    url: '',
    occludes,
  };
}

async function roundTrip(assets: SpriteAsset[]) {
  const blob = buildProjectBundle([], assets, null);
  return openProjectBundle(new Uint8Array(await blob.arrayBuffer()));
}

describe('project bundle asset metadata', () => {
  it('persists the occludes flag across save and reopen', async () => {
    const bundle = await roundTrip([asset('body.png', true), asset('flare.png', false)]);
    const byName = Object.fromEntries(bundle.assets.map((a) => [a.fileName, a.occludes]));
    expect(byName).toEqual({ 'body.png': true, 'flare.png': false });
  });

  it('opens bundles without assets-meta.json with occludes false', async () => {
    const built = buildProjectBundle([], [asset('flare.png', false)], new Uint8Array([1, 2, 3]));
    const bundle = openProjectBundle(new Uint8Array(await built.arrayBuffer()));
    expect(bundle.assets[0].occludes).toBe(false);
    expect(bundle.assets).toHaveLength(1);
  });
});

describe('project bundle limits', () => {
  it('rejects an oversized file before reading its contents', () => {
    const limit = 256 * 1024 * 1024;
    expect(() => checkProjectBundleSize(limit)).not.toThrow();
    expect(() => checkProjectBundleSize(limit + 1)).toThrow('256 MiB');
  });

  it('counts every archive entry, including entries the editor skips', () => {
    const nonProjectFiles = Object.fromEntries(
      Array.from({ length: 4097 }, (_, index) => [`ignored-${index}`, new Uint8Array(0)]),
    );
    expect(() => openProjectBundle(zipSync(nonProjectFiles))).toThrow('4,096 entries');
  });
});
