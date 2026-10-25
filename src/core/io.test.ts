// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportLegacyXml, fromJsonString, importLegacyXml, toJsonString, validateProjectJson } from './io';
import { defaultLayer } from './layers';

// vitest runs with cwd = project root (import.meta.url is unusable under jsdom)
const PRESETS_DIR = join(process.cwd(), 'presets');
const presetFiles = readdirSync(PRESETS_DIR).filter((f: string) => f.endsWith('.xml'));

describe('legacy XML import', () => {
  it('finds the bundled presets', () => {
    expect(presetFiles.length).toBeGreaterThanOrEqual(6);
  });

  it.each(presetFiles)('imports %s with no unknown params', (file: string) => {
    const { layers, warnings } = importLegacyXml(readFileSync(join(PRESETS_DIR, file), 'utf8'));
    expect(warnings).toEqual([]);
    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) {
      expect(['noise', 'points', 'billboards', 'volumetric']).toContain(layer.type);
      expect(layer.name.length).toBeGreaterThan(0);
    }
  });

  it('parses known values from purple-nebula-complex.xml', () => {
    const { layers } = importLegacyXml(
      readFileSync(join(PRESETS_DIR, 'purple-nebula-complex.xml'), 'utf8'),
    );
    const first = layers[0];
    expect(first.type).toBe('noise');
    expect(first.name).toBe('Pink Purple Nebula');
    if (first.type === 'noise') {
      expect(first.octaves).toBe(8);
      expect(first.innerColor).toEqual({ r: 1, g: 0, b: 0.6, a: 1 });
      expect(first.outerColor.g).toBeCloseTo(0.309804, 6);
      expect(first.noiseType).toBe('fbm');
    }
  });

  it('throws on malformed XML', () => {
    expect(() => importLegacyXml('<spacescapelayers><layer>')).toThrow();
  });
});

describe('round-trips', () => {
  it.each(presetFiles)('legacy XML round-trip preserves %s', (file: string) => {
    const original = importLegacyXml(readFileSync(join(PRESETS_DIR, file), 'utf8'));
    const reimported = importLegacyXml(exportLegacyXml(original.layers));
    expect(reimported.warnings).toEqual([]);
    expect(reimported.layers).toEqual(original.layers);
  });

  it.each(presetFiles)('JSON v2 round-trip preserves %s', (file: string) => {
    const original = importLegacyXml(readFileSync(join(PRESETS_DIR, file), 'utf8'));
    const reimported = fromJsonString(toJsonString(original.layers));
    expect(reimported.warnings).toEqual([]);
    expect(reimported.layers).toEqual(original.layers);
  });

  it('rejects non-v2 JSON', () => {
    expect(() => fromJsonString('{"version":1,"layers":[]}')).toThrow();
    expect(() => fromJsonString('{}')).toThrow();
  });

  it('persists visible=false and locked through both formats', () => {
    const noise = defaultLayer('noise', 'Hidden Nebula');
    noise.visible = false;
    const sun = defaultLayer('sun', 'Pinned Sun');
    sun.locked = true;

    const viaJson = fromJsonString(toJsonString([noise, sun])).layers;
    expect(viaJson[0].visible).toBe(false);
    expect(viaJson[1].locked).toBe(true);

    const viaXml = importLegacyXml(exportLegacyXml([noise, sun]));
    expect(viaXml.warnings).toEqual([]);
    expect(viaXml.layers[0].visible).toBe(false);
    expect(viaXml.layers[1].locked).toBe(true);
  });

  it("drops the original's redundant <visible>true</visible> on import", () => {
    const { layers, warnings } = importLegacyXml(
      '<spacescapelayers><layer><type>points</type><visible>true</visible></layer></spacescapelayers>',
    );
    expect(warnings).toEqual([]);
    expect(layers[0].visible).toBeUndefined();
  });
});

describe('legacy parsing quirks (parity with the C++ loader)', () => {
  const wrap = (params: string) =>
    `<spacescapelayers><layer><type>points</type>${params}</layer></spacescapelayers>`;

  it('truncates pointSize like StringConverter::parseInt', () => {
    const { layers } = importLegacyXml(wrap('<pointSize>1.9</pointSize>'));
    expect(layers[0]).toMatchObject({ pointSize: 1 });
  });

  it('clamps maskThreshold to [0,1] like the C++ layers', () => {
    expect(importLegacyXml(wrap('<maskThreshold>2.5</maskThreshold>')).layers[0])
      .toMatchObject({ maskThreshold: 1 });
    expect(importLegacyXml(wrap('<maskThreshold>-3</maskThreshold>')).layers[0])
      .toMatchObject({ maskThreshold: 0 });
  });

  it('parses numeric prefixes like istream, and never yields NaN', () => {
    const { layers } = importLegacyXml(
      wrap('<maskGain>1.5junk</maskGain><nearColor>1 bad 0</nearColor>'),
    );
    expect(layers[0]).toMatchObject({
      maskGain: 1.5,
      nearColor: { r: 1, g: 0, b: 0, a: 1 },
    });
  });

  it('layers missing <type> default to points', () => {
    const { layers, warnings } = importLegacyXml(
      '<spacescapelayers><layer><name>x</name></layer></spacescapelayers>',
    );
    expect(warnings).toEqual([]);
    expect(layers[0].type).toBe('points');
  });
});

describe('JSON v2 robustness', () => {
  it('deep-merges partial colors and sanitizes bad values', () => {
    const { layers, warnings } = fromJsonString(JSON.stringify({
      version: 2,
      layers: [{
        type: 'points',
        name: 'partial',
        nearColor: { r: 0.25 },
        numPoints: 12.7,
        maskThreshold: 99,
        pointSize: 'huge',
      }],
    }));
    expect(warnings).toEqual([]);
    expect(layers[0]).toMatchObject({
      nearColor: { r: 0.25, g: 1, b: 1, a: 1 },
      numPoints: 12,
      maskThreshold: 1,
      pointSize: 1,
    });
    // sanitized layers must always survive XML export
    expect(() => exportLegacyXml(layers)).not.toThrow();
  });
});


describe('galactic nebula persistence', () => {
  it('round trips all band controls through native JSON and legacy XML', () => {
    const band = { ...defaultLayer('noise'), bandEnabled: true, bandWidthDeg: 14, bandAngleDeg: 37,
      bandCenterLonDeg: -124, bandCenterLatDeg: 8, bandCenterSizeDeg: 32, bandCenterGlow: 2.4,
      bandCenterColor: { r: 0.8, g: 0.4, b: 0.2, a: 1 },
      bandCoreOnly: true, bandIntensity: 0.7, bandOffsetDeg: -5, bandEdgePower: 3, bandTurbulence: 1.2,
      bandCoreStretchX: 4, bandCoreStretchY: 0.5, bandCoreRotationDeg: 22,
      bandCoreFalloff: 3, bandHaloAmount: 0.4, bandHaloSize: 2.5 };
    expect(fromJsonString(toJsonString([band])).layers).toEqual([band]);
    const xml = importLegacyXml(exportLegacyXml([band]));
    expect(xml.warnings).toEqual([]); expect(xml.layers).toEqual([band]);
  });
});


describe('built-in black-hole plume stacks', () => {
  const first = { name: 'Warm cloud', seed: 71, jetEnabled: true, visible: true, jetLength: 12, jetGap: 3,
    jetCurveStart: 4, jetCurve: 1.5, jetWidth: 0.3, jetSize: 0.8, jetTextureSize: 256,
    jetNoiseType: 'ridged' as const, jetOctaves: 6, jetGain: 0.6, jetLacunarity: 2.1, jetOffset: 0.9,
    jetHdrPower: 0.9, jetShelf: 0.2, jetPower: 1.2, jetWarpScale: 2, jetWarp: 0.4, jetNoiseScale: 7,
    jetDensity: 2, jetContrast: 1.5, jetDust: 0.3, jetAbsorption: 0.2, jetBrightness: 1.8,
    jetAngleDeg: 40, jetConeDeg: 12, jetAsymmetry: 0.1, jetLaunchFade: 0.4, knots: 3,
    tipGlow: 2, tipSize: 0.15, jetRampAlongLength: true,
    jetColor: { r: 1, g: 0.5, b: 0.2, a: 1 }, jetOuterColor: { r: 0.1, g: 0.03, b: 0.01, a: 1 },
    jetColorRamp: [{ t: 0, color: { r: 0.1, g: 0.2, b: 0.3, a: 1 } }, { t: 1, color: { r: 1, g: 0.7, b: 0.2, a: 1 } }] };
  it('preserves base and independent additional jets in JSON, XML and scene validation', () => {
    const layer = { ...defaultLayer('blackhole'), ...first, name: 'Native BH', seed: 12, visible: false,
      coreVisible: false, jetSeed: 61, jetBaseVisible: false,
      jetLayers: [first, { ...first, name: 'Cool cloud', seed: 99, visible: false, jetLength: 30, jetGap: 7, jetCurve: -2 }] };
    expect(validateProjectJson({ version: 2, layers: [layer] })).toBeNull();
    expect(fromJsonString(toJsonString([layer])).layers).toEqual([layer]);
    const xml = importLegacyXml(exportLegacyXml([layer]));
    expect(xml.warnings).toEqual([]); expect(xml.layers).toEqual([layer]);
  });
  it('reports the nested jet and field for invalid script values', () => {
    const error = validateProjectJson({ version: 2, layers: [{ type: 'blackhole', jetLayers: [{ jetLength: 'huge' }] }] });
    expect(error?.message).toContain('jet 0'); expect(error?.message).toContain('jetLength');
  });
  it('normalizes malformed colors/noise and drops malformed stack entries', () => {
    const loaded = fromJsonString(JSON.stringify({ version: 2, layers: [{ type: 'blackhole', jetColor: { r: 0.9 }, jetNoiseType: 'bad', jetLayers: [null, { name: 'Partial', seed: 2, jetColor: { b: 0.2 }, jetNoiseType: 'bad' }] }] })).layers[0];
    expect(loaded.type).toBe('blackhole');
    if (loaded.type !== 'blackhole') return;
    expect(loaded.jetColor).toEqual({ r: 0.9, g: 0.75, b: 1, a: 1 });
    expect(loaded.jetNoiseType).toBe('fbm'); expect(loaded.jetLayers).toHaveLength(1);
    expect(loaded.jetLayers![0].jetColor).toEqual({ r: 0.6, g: 0.75, b: 0.2, a: 1 });
    expect(loaded.jetLayers![0].jetNoiseType).toBe('fbm');
  });
});
