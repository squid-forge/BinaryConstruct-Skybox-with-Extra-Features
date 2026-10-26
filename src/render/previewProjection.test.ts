import { describe, expect, it } from 'vitest';
import { previewVerticalFov } from './previewProjection';

describe('placement projection', () => {
  it('keeps the widest axis at the requested FOV across viewport shapes', () => {
    for (const aspect of [0.3, 1, 16 / 9, 32 / 9, 8]) for (const requested of [15, 60, 70]) {
      const vertical = previewVerticalFov(requested, aspect, true);
      const horizontal = 2 * Math.atan(Math.tan(vertical * Math.PI / 360) * aspect) * 180 / Math.PI;
      expect(Math.max(vertical, horizontal)).toBeCloseTo(requested, 10);
    }
  });

  it('preserves the original vertical-FOV convention in wide view', () => {
    expect(previewVerticalFov(100, 32 / 9, false)).toBe(100);
  });
});
