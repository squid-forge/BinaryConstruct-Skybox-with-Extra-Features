// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { defaultNebulaCloud, SMOKE_MASKS } from './nebulaCloud';
import { defaultBlackHoleLayer, defaultVolumetricLayer } from './layers';
import { exportLegacyXml, fromJsonString, importLegacyXml, toJsonString } from './io';

it('roundtrips local cloud placement and smoke settings for clouds, volumes and nested native jets', () => {
  const cloud = defaultNebulaCloud(143, -37);
  const settings = { smokeEnabled: true, cloudMask: 'wisps', cloudStyle: 3, cloudLight2Power: 7, cloudShafts: 3, cloudErosion: 0.7, cloudRadial: true, cloudRadius: 0.7, cloudInnerRadius: 0.2, cloudRadialFalloff: 0.8, cloudLightVisible: true, cloudLightRadius: 0.03, cloudLightGlow: 1.5 };
  const layers = [
    { ...cloud, ...settings, locked: true, cloudMaskScale: 1.7, cloudFeather: 0.23, aspect: 2, rotationDeg: 70 },
    { ...defaultVolumetricLayer(), ...settings },
    { ...defaultBlackHoleLayer(), ...settings, jetEnabled: true, jetLayers: [{ ...settings, name: 'independent smoke', seed: 877 }] },
  ];
  expect(fromJsonString(toJsonString(layers)).layers).toEqual(layers);
  expect(importLegacyXml(exportLegacyXml(layers)).layers).toEqual(layers);
});
it('creates independent palette objects and does not modify all-sky defaults', () => {
  const a = defaultNebulaCloud(), b = defaultNebulaCloud();
  a.colorRamp![1].color.r = 42;
  expect(b.colorRamp![1].color.r).not.toBe(42);
  expect(a.destBlendFactor).toBe('one_minus_src_alpha');
  expect(SMOKE_MASKS.length).toBe(5);
});
