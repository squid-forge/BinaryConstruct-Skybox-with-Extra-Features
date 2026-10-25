import { describe, expect, it } from 'vitest';
import { defaultBlackHoleLayer } from '../core/layers';
import { nativePlumeMaterial } from './nativePlumeMaterial';

describe('native procedural jet material', () => {
  it('keeps full procedural detail independently of legacy texture-resolution settings', () => {
    const parent = defaultBlackHoleLayer();
    const low = nativePlumeMaterial({ ...parent, jetTextureSize: 256 }, parent);
    const high = nativePlumeMaterial({ ...parent, jetTextureSize: 2048 }, parent);
    try {
      expect(low.material.fragmentShader).toBe(high.material.fragmentShader);
      expect(low.material.fragmentShader).toContain('densityAt');
      expect(low.material.uniforms.plumeShapeA.value.toArray()).toEqual(high.material.uniforms.plumeShapeA.value.toArray());
      expect(low.material.uniforms.permTexture.value.image.data).toEqual(high.material.uniforms.permTexture.value.image.data);
      expect('map' in low.material).toBe(false);
    } finally { low.dispose(); high.dispose(); }
  });
  it('uses independent seeded noise and preserves linear HDR brightness in stacks', () => {
    const parent = { ...defaultBlackHoleLayer(), hdrMultiplier: 12, hdrPower: 1.5 };
    const base = nativePlumeMaterial({ name: 'Base', seed: 31, jetLength: 8, jetBrightness: 3 }, parent);
    const stack = nativePlumeMaterial({ name: 'Outer', seed: 99, jetLength: 20, jetBrightness: 1 }, parent);
    try {
      expect(base.material.uniforms.permTexture.value.image.data).not.toEqual(stack.material.uniforms.permTexture.value.image.data);
      expect(base.material.uniforms.hdrMultiplierAmt.value).toBe(12);
      expect(base.material.uniforms.hdrPowerAmt.value).toBe(1);
      expect(base.material.uniforms.plumeEmit.value.y).toBe(3);
      expect(stack.material.uniforms.plumeEmit.value.y).toBe(1);
      expect(base.material.uniforms.plumeShapeA.value.x).toBeCloseTo(0.8);
      expect(stack.material.uniforms.plumeShapeA.value.x).toBeCloseTo(2);
    } finally { base.dispose(); stack.dispose(); }
  });
});


it('keeps a high parent HDR exponent from erasing low-density, dusty plumes', () => {
  const parent = { ...defaultBlackHoleLayer(), hdrPower: 5, hdrMultiplier: 10 };
  const jet = nativePlumeMaterial({ ...parent, jetShelf: 0.41, jetPower: 1.25, jetContrast: 1.35, jetDust: 0.06 }, parent);
  const explicit = nativePlumeMaterial({ ...parent, jetHdrPower: 2 }, parent);
  try {
    expect(jet.material.uniforms.hdrPowerAmt.value).toBe(1);
    expect(explicit.material.uniforms.hdrPowerAmt.value).toBe(2);
    const shaped = Math.pow(Math.pow((0.6 - 0.41) / (1 - 0.41), 1 / 1.25), 1.35);
    expect(Math.max(0, Math.pow(shaped, 5) - 0.03)).toBe(0);
    expect(Math.max(0, shaped - 0.03)).toBeGreaterThan(0.2);
  } finally { jet.dispose(); explicit.dispose(); }
});
