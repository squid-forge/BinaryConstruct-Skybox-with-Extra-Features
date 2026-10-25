import { NOISE_COMMON } from './noiseGlsl';

export const CLOUD_FRAG = /* glsl */ `${NOISE_COMMON}
void main() {
  vec2 uv = vertexPos.xy;
  vec2 edge = abs(uv - 0.5) * 2.0;
  float envelope = 1.0 - smoothstep(1.0 - smokeShape.w, 1.0, max(edge.x, edge.y));
  if (envelope <= 0.0) discard;
  vec3 q = vec3((uv - 0.5) * noiseScale * 2.0, 1.73);
  if (warpStrength > 0.0) q += warpStrength * fbm3(q * warpScale, min(octaves, 4), lacunarity, gain);
  float n = ridgedNoise ? ridgedFbmNoise(q, octaves, lacunarity, gain, offset) : fbmNoise(q, octaves, lacunarity, gain);
  n = clamp(n * 0.5 + 0.5, 0.0, 1.0);
  n = pow(max(0.0, n - shelfAmt) / max(0.001, 1.0 - shelfAmt), 1.0 / max(0.01, powerAmt));
  float density = smokeDensityAt(uv) * n * envelope;
  float colorT = clamp(n * 1.8 - 0.25, 0.0, 1.0);
  vec3 color = useRamp ? texture(rampTexture, vec2(colorT, 0.5)).rgb : mix(outerColor, innerColor, n);
  color = smokeShade(uv, color);
  float opacity = 1.0 - exp(-density * smokeMedium.y);
  float extinction = 1.0 - exp(-density * smokeMedium.y * smokeMedium.z);
  vec3 emission = pow(max(color * opacity, vec3(0.0)), vec3(hdrPowerAmt)) * hdrMultiplierAmt;
  fragColor = vec4(emission + smokeSources(uv) * envelope * hdrMultiplierAmt, extinction);
}
`;
