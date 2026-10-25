import { expect, it } from 'vitest';
import { applySmokeToCanvas } from './smokeCpu';
import type { SmokeParams } from '../core/layers';

function render(params: SmokeParams) {
  const pixels = new Uint8ClampedArray(24 * 24 * 4).fill(160);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  const canvas = { width: 24, height: 24, getContext: () => ({ getImageData: () => ({ data: pixels }), putImageData() {} }) } as unknown as HTMLCanvasElement;
  applySmokeToCanvas(canvas, params, 789);
  return pixels;
}
it('keeps legacy bakes unchanged and produces seeded repeatable smoke', () => {
  const old = render({}); expect(old[0]).toBe(160); expect(old[3]).toBe(255);
  const params = { smokeEnabled: true, cloudStyle: 1, cloudShadow: 3 };
  expect(render(params)).toEqual(render(params)); expect(render(params)).not.toEqual(old);
});
it('responds to light power, self shadow and smoke pattern independently', () => {
  const params = { smokeEnabled: true, cloudLightPower: 5, cloudLight2Power: 0, cloudLightZ: 0.05, cloudDensity: 2, cloudAmbient: 0.1, cloudShadow: 5 };
  const base = render(params);
  expect(render({ ...params, cloudShadow: 0 })).not.toEqual(base);
  expect(render({ ...params, cloudLightPower: 0 })).not.toEqual(base);
  expect(render({ ...params, cloudStyle: 2 })).not.toEqual(base);
});
