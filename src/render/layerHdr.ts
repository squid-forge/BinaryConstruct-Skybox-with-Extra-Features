import * as THREE from 'three';
import type { Layer } from '../core/layers';

/** Apply radiance controls before blending, leaving coverage/occlusion intact. */
export function attachLayerHdr(group: THREE.Group, initial: Layer) {
  const power = { value: initial.hdrPower ?? 1 }, multiplier = { value: initial.hdrMultiplier ?? 1 };
  const installed = new WeakSet<THREE.Material>();
  const install = () => group.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (installed.has(material) || !material.colorWrite) continue;
      installed.add(material);
      if (material instanceof THREE.ShaderMaterial) {
        material.uniforms.layerHdrPower = power;
        material.uniforms.layerHdrMultiplier = multiplier;
        material.fragmentShader = 'uniform float layerHdrPower;\nuniform float layerHdrMultiplier;\n' + material.fragmentShader.replace(
          /}\s*$/, 'fragColor.rgb = pow(max(fragColor.rgb, vec3(0.0)), vec3(layerHdrPower)) * layerHdrMultiplier;\n}',
        );
      } else if (material instanceof THREE.MeshBasicMaterial) {
        const compile = material.onBeforeCompile.bind(material);
        const key = material.customProgramCacheKey();
        material.onBeforeCompile = (shader, renderer) => {
          compile(shader, renderer);
          shader.uniforms.layerHdrPower = power;
          shader.uniforms.layerHdrMultiplier = multiplier;
          shader.fragmentShader = 'uniform float layerHdrPower;\nuniform float layerHdrMultiplier;\n' + shader.fragmentShader.replace(
            '#include <opaque_fragment>',
            'outgoingLight = pow(max(outgoingLight, vec3(0.0)), vec3(layerHdrPower)) * layerHdrMultiplier;\n#include <opaque_fragment>',
          );
        };
        material.customProgramCacheKey = () => `${key}:layer-hdr`;
      }
      material.needsUpdate = true;
    }
  });
  install();
  return {
    install,
    update: (layer: Layer) => { power.value = layer.hdrPower ?? 1; multiplier.value = layer.hdrMultiplier ?? 1; },
  };
}
