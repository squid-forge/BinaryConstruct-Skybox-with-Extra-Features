import { expect, it } from 'vitest';
import { addSpriteAsset, clearSpriteAssets } from './spriteStore';

it('creates a decodable asset URL from only the supplied byte range', async () => {
  const source = new Uint8Array([99, 99, 137, 80, 78, 71, 88]);
  const payload = source.subarray(2, 6);
  try {
    const asset = addSpriteAsset('embedded.png', payload, 'image/png');
    const restored = new Uint8Array(await (await fetch(asset.url)).arrayBuffer());
    expect(restored).toEqual(payload);
  } finally { clearSpriteAssets(); }
});
