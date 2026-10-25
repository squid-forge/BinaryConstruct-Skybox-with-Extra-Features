import * as THREE from 'three';
import type { SmokeParams } from '../core/layers';
import { SMOKE_MASKS } from '../core/nebulaCloud';

const finite = (v: number | undefined, fallback: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v! : fallback));
export function smokeUniforms() {
  return {
    smokeRadial: { value: new THREE.Vector4() }, smokeSource: { value: new THREE.Vector4() },
    smokeEnabled: { value: false }, smokeSpherical: { value: false }, smokeHasMask: { value: false }, smokeTexture: { value: null as THREE.Texture | null },
    smokeShape: { value: new THREE.Vector4() }, smokeMedium: { value: new THREE.Vector4() }, smokeLook: { value: new THREE.Vector4() },
    smokeLight1: { value: new THREE.Vector4() }, smokeLight2: { value: new THREE.Vector4() },
    smokeColor1: { value: new THREE.Vector3() }, smokeColor2: { value: new THREE.Vector3() },
  };
}
export function updateSmokeUniforms(material: THREE.ShaderMaterial, p: SmokeParams, enabled = p.smokeEnabled === true, spherical = false) {
  const u = material.uniforms;
  u.smokeEnabled.value = enabled;
  u.smokeSpherical.value = spherical;
  u.smokeRadial.value.set(p.cloudRadial ? 1 : 0, finite(p.cloudRadius, 1, 0.05, 2), finite(p.cloudInnerRadius, 0, 0, 0.95), finite(p.cloudRadialFalloff, 0.4, 0.01, 8));
  u.smokeSource.value.set(p.cloudLightVisible ? 1 : 0, finite(p.cloudLightRadius, 0.012, 0.001, 0.5), finite(p.cloudLightGlow, 0.7, 0, 10), 0);
  u.smokeShape.value.set(finite(p.cloudStyle, 0, 0, 3), finite(p.cloudMaskScale, 1, 0.1, 10), finite(p.cloudErosion, 0.5, 0, 1), finite(p.cloudFeather, 0.16, 0.01, 1));
  u.smokeMedium.value.set(finite(p.cloudDensity, 2.5), finite(p.cloudDepth, 0.6, 0.01, 5), finite(p.cloudAbsorption, 1.8), finite(p.cloudShadow, 2));
  u.smokeLook.value.set(finite(p.cloudAmbient, 0.5), finite(p.cloudShafts, 0.8), finite(p.cloudSaturation, 1.2, 0, 3), 0);
  u.smokeLight1.value.set(finite(p.cloudLightX, -0.15, -2, 2) + 0.5, finite(p.cloudLightY, 0.05, -2, 2) + 0.5, finite(p.cloudLightZ, 0.6, -3, 3), finite(p.cloudLightPower, 2.5));
  u.smokeLight2.value.set(finite(p.cloudLight2X, 0.35, -2, 2) + 0.5, finite(p.cloudLight2Y, -0.2, -2, 2) + 0.5, finite(p.cloudLight2Z, 0.3, -3, 3), finite(p.cloudLight2Power, 1));
  for (const [name, c] of [['smokeColor1', p.cloudLightColor ?? { r: 0.5, g: 0.8, b: 1 }], ['smokeColor2', p.cloudLight2Color ?? { r: 1, g: 0.35, b: 0.12 }]] as const) u[name].value.set(c.r, c.g, c.b);
}
/** Owns texture lifetime, including disposal while an asynchronous load is pending. */
export function configureSmoke(material: THREE.ShaderMaterial, p: SmokeParams, enabled = p.smokeEnabled === true, spherical = false) {
  const u = material.uniforms;
  u.smokeHasMask.value = false; u.smokeTexture.value = null;
  updateSmokeUniforms(material, p, enabled, spherical);
  let texture: THREE.Texture | undefined, disposed = false;
  let pending = enabled && SMOKE_MASKS.includes(p.cloudMask as typeof SMOKE_MASKS[number]) && p.cloudMask !== 'procedural';
  const ready = pending
    ? new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}masks/smoke/${p.cloudMask}.png`).then(t => {
      texture = t;
      if (disposed) { t.dispose(); return; }
      t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      u.smokeTexture.value = t; u.smokeHasMask.value = true;
    }).finally(() => { pending = false; }) : Promise.resolve();
  return { ready, get pending() { return pending; }, dispose() { disposed = true; texture?.dispose(); } };
}
