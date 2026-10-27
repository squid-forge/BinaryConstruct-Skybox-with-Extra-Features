import { describe, expect, it } from 'vitest';
import { lensCaptureSettings } from './lensCapture';

describe('export lens detail limits', () => {
  it('reports the auto ceiling and stays within its aggregate budget', () => {
    for (const count of [1, 2, 8, 24]) {
      const result = lensCaptureSettings(16384, count);
      expect(result.faceSize).toBeLessThanOrEqual(1024);
      expect(result.totalBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
      expect(result.reduced).toBe(true);
    }
    expect(lensCaptureSettings(16384, 1).faceSize).toBe(1024);
  });
  it('preserves explicit detail without falling back to the auto budget', () => {
    expect(lensCaptureSettings(16384, 1, 4096).faceSize).toBe(4096);
    expect(lensCaptureSettings(16384, 1, 'native')).toEqual({ faceSize: 16384, bytesPerLens: 12884901888, totalBytes: 12884901888, reduced: false });
    expect(lensCaptureSettings(512, 1, 4096).faceSize).toBe(512);
    expect(lensCaptureSettings(512, 0).reduced).toBe(false);
  });
  it('rejects unsupported capture sizes rather than silently downgrading them', () => {
    for (const size of [0, 15, 513, NaN, Infinity]) expect(() => lensCaptureSettings(16384, 1, size)).toThrow('power of two');
  });
});
