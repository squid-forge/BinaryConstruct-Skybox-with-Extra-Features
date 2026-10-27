import { describe, expect, it } from 'vitest';
import { assertExportTextureSize } from './sourceDetail';

describe('export raster source detail', () => {
  it('accepts source pixels up to the actual GPU texture limit', () => {
    expect(() => assertExportTextureSize({ image: { width: 16384, height: 8192 } }, 'nebula.png', 16384)).not.toThrow();
    expect(() => assertExportTextureSize(null, 'missing.png', 16384)).not.toThrow();
  });
  it('refuses silent downscaling of uploaded images and HDR textures', () => {
    expect(() => assertExportTextureSize({ image: { width: 32768, height: 16384 } }, 'nebula.exr', 16384)).toThrow('avoid silently reducing source detail');
    expect(() => assertExportTextureSize({ image: { width: 512, height: 512, naturalWidth: 32768, naturalHeight: 16384 } }, 'nebula.png', 16384)).toThrow('32768 × 16384');
  });
});
