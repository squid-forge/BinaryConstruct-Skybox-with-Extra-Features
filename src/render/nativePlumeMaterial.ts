import * as THREE from 'three';
import type { BlackHoleJetLayer, BlackHoleLayer } from '../core/layers';
import { nativePlumeParams, plumeFrame, plumeShapeFromParams } from '../gen/plumeGeometry';
import { NoiseCubemap } from './NoiseCubemap';
import { applyBlend } from './blend';

const finite = (value: number | undefined, fallback: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value! : fallback));

export function nativePlumeMaterial(component: BlackHoleJetLayer | BlackHoleLayer, parent: BlackHoleLayer) {
  const p = nativePlumeParams(component), shape = plumeShapeFromParams(p);
  // A tiny unrendered target owns only the shared seeded LUT/ramp resources.
  const noise = new NoiseCubemap(1, 'half', 'plume');
  noise.configure({
    ...p,
    seed: (component.seed + 0x51e7) >>> 0,
    noiseType: p.jetNoiseType ?? 'fbm',
    innerColor: p.jetColor ?? { r: 0.6, g: 0.75, b: 1, a: 1 },
    outerColor: p.jetOuterColor ?? { r: 0.18, g: 0.15, b: 0.45, a: 1 },
    octaves: Math.round(finite(p.jetOctaves, 6, 1, 16)),
    gain: finite(p.jetGain, 0.5, 0, 2), lacunarity: finite(p.jetLacunarity, 2, 1, 8),
    offset: finite(p.jetOffset, 1, 0, 2), powerAmount: finite(p.jetPower, 1, 0.01, 20),
    shelfAmount: finite(p.jetShelf, 0, 0, 0.999), ditherAmount: 0,
    scale: finite(p.jetNoiseScale, 5, 0.01, 1000),
    warpStrength: finite(p.jetWarp, 0.5, 0, 10), warpScale: finite(p.jetWarpScale, 1, 0.01, 10),
    colorRamp: p.jetColorRamp,
    hdrPower: finite(p.jetHdrPower, 1, 0.01, 20), hdrMultiplier: finite(parent.hdrMultiplier, 1, 0, 1000),
  });
  const material = noise.directMaterial;
  material.side = THREE.DoubleSide;
  material.transparent = true;
  applyBlend(material, 'one', 'one');
  const vector = (name: string, a: number, b: number, c: number, d: number) => {
    material.uniforms[name] = { value: new THREE.Vector4(a, b, c, d) };
  };
  vector('plumeShapeA', shape.length, shape.gap, shape.width, Math.tan(shape.coneDeg * Math.PI / 180));
  vector('plumeShapeB', shape.curveStart, shape.curve, plumeFrame(shape), finite(p.jetAngleDeg, 20, -36000, 36000) * Math.PI / 180);
  vector('plumeEmit', finite(p.jetDensity, 1.5, 0, 100), finite(p.jetBrightness, 1, 0, 100), finite(p.jetContrast, 1, 0.01, 20), finite(p.jetDust, 0, 0, 1));
  vector('plumeMore', finite(p.jetAbsorption, 0, 0, 100), finite(p.jetAsymmetry, 0.2, 0, 1), finite(p.jetLaunchFade, 0.03, 0.0001, 1e6), finite(p.tipGlow, 1, 0, 100));
  vector('plumeTip', shape.tipSize, Math.round(finite(p.knots, 4, 0, 32)), p.jetRampAlongLength ? 1 : 0, 0);
  return { material, ready: noise.ready, dispose: () => noise.dispose() };
}
