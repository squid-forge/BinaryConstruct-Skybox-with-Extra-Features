import { defaultNoiseLayer, type NoiseLayer } from './layers';
import { PALETTES } from './palettes';

export const SMOKE_MASKS = ['procedural', 'puff', 'billow', 'wisps', 'burst'] as const;
export function defaultNebulaCloud(lon = 0, lat = 0): NoiseLayer {
  return {
    ...defaultNoiseLayer('Nebula Cloud'), hdrMultiplier: 2, seed: 37013, cloudEnabled: true,
    dirLonDeg: lon, dirLatDeg: lat, apparentSize: 0.5, aspect: 1.3, rotationDeg: 0,
    sourceBlendFactor: 'one', destBlendFactor: 'one_minus_src_alpha',
    cloudMask: 'billow', cloudRadial: true, cloudRadius: 1, cloudRadialFalloff: 0.4, cloudLightVisible: true, cloudLightRadius: 0.012, cloudLightGlow: 0.7, cloudStyle: 0, cloudDensity: 4, cloudDepth: 0.9,
    cloudMaskScale: 1, cloudErosion: 0.5, cloudFeather: 0.16,
    cloudAbsorption: 1.8, cloudShadow: 2, cloudShafts: 0.8, cloudAmbient: 0.8,
    cloudSaturation: 1.2, cloudLightX: 0, cloudLightY: 0, cloudLightZ: 0.6,
    cloudLightPower: 4, cloudLightColor: { r: 0.5, g: 0.8, b: 1, a: 1 },
    cloudLight2X: 0.35, cloudLight2Y: -0.2, cloudLight2Z: 0.3,
    cloudLight2Power: 1, cloudLight2Color: { r: 1, g: 0.35, b: 0.12, a: 1 },
    octaves: 6, gain: 0.58, scale: 4.5, warpStrength: 0.6, warpScale: 1.2,
    shelfAmount: 0.18, powerAmount: 0.85,
    colorRamp: structuredClone(PALETTES['Oxygen and warm dust']),
  };
}
