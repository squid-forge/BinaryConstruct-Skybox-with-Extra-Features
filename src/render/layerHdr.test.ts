import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { attachLayerHdr } from './layerHdr';
import { defaultLayer, defaultBlackHoleLayer } from '../core/layers';
import { buildBlackHoleObject } from './blackHoleLayer';
import { PreviewScene } from './PreviewScene';

describe('layer HDR radiance', () => {
  it('captures only lower layers and restores visibility after errors', () => {
    const bottom = new THREE.Group(), lens = new THREE.Group(), front = new THREE.Group(), hidden = new THREE.Group();
    hidden.visible = false;
    const objects = [
      { group: bottom },
      { group: lens, prepare: () => {
        expect(bottom.visible).toBe(true); expect(front.visible).toBe(false); expect(hidden.visible).toBe(false);
        throw new Error('capture failed');
      } },
      { group: front }, { group: hidden },
    ];
    const capture = (PreviewScene as unknown as { prepareObjects: (stack: typeof objects, renderer: THREE.WebGLRenderer, scene: THREE.Scene) => void }).prepareObjects;
    expect(() => capture(objects, {} as THREE.WebGLRenderer, new THREE.Scene())).toThrow('capture failed');
    expect(front.visible).toBe(true); expect(hidden.visible).toBe(false);
    lens.visible = false;
    expect(() => capture(objects, {} as THREE.WebGLRenderer, new THREE.Scene())).not.toThrow();
  });

  it('updates shared uniforms without rebuilding geometry and preserves alpha', () => {
    const group = new THREE.Group(), material = new THREE.ShaderMaterial({ fragmentShader: 'void main() { fragColor = vec4(1.0); }' });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material); group.add(mesh);
    const layer = defaultLayer('points'), hdr = attachLayerHdr(group, layer);
    hdr.update({ ...layer, hdrPower: 2, hdrMultiplier: 0 });
    expect(material.uniforms.layerHdrPower.value).toBe(2);
    expect(material.uniforms.layerHdrMultiplier.value).toBe(0);
    expect(material.fragmentShader).toContain('fragColor.rgb = pow(');
    const shader = material.fragmentShader; hdr.install(); expect(material.fragmentShader).toBe(shader);
    mesh.geometry.dispose(); material.dispose();
  });

  it('installs on async children using the latest values', () => {
    const group = new THREE.Group(), layer = defaultLayer('billboards');
    const hdr = attachLayerHdr(group, layer); hdr.update({ ...layer, hdrMultiplier: 7 });
    const material = new THREE.ShaderMaterial({ fragmentShader: 'void main() { fragColor = vec4(1.0); }' });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material); group.add(mesh); hdr.install();
    expect(material.uniforms.layerHdrMultiplier.value).toBe(7);
    mesh.geometry.dispose(); material.dispose();
  });

  it('retains a black hole and independently tunes its jets without applying HDR to background', () => {
    const layer = { ...defaultBlackHoleLayer(), jetEnabled: true, jetLayers: [{ name: 'Second', seed: 5, jetEnabled: true }] };
    const object = buildBlackHoleObject(layer, 0, 50, 16);
    try {
      const lens = object.group.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
      const jets = object.group.children.slice(1, 3) as typeof lens[];
      expect(object.updateEmission({ ...layer, hdrPower: 3, hdrMultiplier: 6, jetHdrPower: 2, jetLayers: [{ ...layer.jetLayers[0], jetBrightness: 4 }] })).toBe(true);
      expect(lens.material.uniforms.hdrPowerAmt.value).toBe(3);
      expect(jets[0].material.uniforms.hdrPowerAmt.value).toBe(2);
      expect(jets[1].material.uniforms.plumeEmit.value.y).toBe(4);
      expect(jets[1].material.uniforms.hdrMultiplierAmt.value).toBe(6);
      expect(lens.material.fragmentShader).toContain('pow(max(emission,');
      expect(object.updateEmission({ ...layer, discTiltDeg: layer.discTiltDeg + 1 })).toBe(false);
    } finally { object.dispose(); }
  });

  it('evicts idle trajectory textures while retaining ones used by live lenses', () => {
    const make = (distance: number) => buildBlackHoleObject({ ...defaultBlackHoleLayer(), apparentSize: Math.asin(2.598076211 / distance) }, 0, 50, 16);
    const pinned = make(170), idle = make(180);
    const texture = (object: ReturnType<typeof make>) => (object.group.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>).material.uniforms.trajLut.value as THREE.DataTexture;
    let pinnedDisposed = false, idleDisposed = false;
    texture(pinned).addEventListener('dispose', () => { pinnedDisposed = true; });
    texture(idle).addEventListener('dispose', () => { idleDisposed = true; });
    idle.dispose(); idle.dispose();
    try {
      for (let distance = 20; distance <= 160; distance += 10) make(distance).dispose();
      expect(idleDisposed).toBe(true);
      expect(pinnedDisposed).toBe(false);
    } finally { pinned.dispose(); }
  });
});
