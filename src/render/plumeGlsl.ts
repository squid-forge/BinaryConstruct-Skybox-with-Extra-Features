import { NOISE_COMMON } from './noiseGlsl';

export const PLUME_VERT = /* glsl */ `
out vec3 vertexPos;
void main() {
  vertexPos = vec3(uv, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Native jets evaluate noise, geometry and linear radiance at the output pixel. */
export const PLUME_FRAG = /* glsl */ `${NOISE_COMMON}
uniform vec4 plumeShapeA; // length, gap, width, cone slope
uniform vec4 plumeShapeB; // curve start, curvature, frame, angle
uniform vec4 plumeEmit;   // density, brightness, contrast, dust
uniform vec4 plumeMore;   // absorption, asymmetry, launch fade, tip strength
uniform vec4 plumeTip;    // tip extent, knots, ramp-along-length, unused

float curveAt(float t) {
  float travel = max(0.0, t - plumeShapeB.x);
  return plumeShapeB.y * travel * travel / plumeShapeA.x;
}

float densityAt(vec2 p) {
  vec3 q = vec3(p / plumeShapeA.x * noiseScale, 1.7);
  if (warpStrength > 0.0) q += warpStrength * fbm3(q * warpScale, min(octaves, 4), lacunarity, gain);
  float footprint = max(length(dFdx(q)), length(dFdy(q)));
  float sum = 0.0, amp = 1.0, den = 0.0, prev = 1.0;
  // Remove noise frequencies smaller than an output pixel, instead of baking
  // them into a low-resolution texture that blurs or shimmers when enlarged.
  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;
    float resolved = 1.0 - smoothstep(0.25, 0.75, footprint);
    float n = perlinNoise(q);
    if (ridgedNoise) { float r = ridge(n, offset); n = r * prev; prev = r; }
    sum += n * amp * resolved; den += amp;
    q *= lacunarity; amp *= gain; footprint *= lacunarity;
  }
  float n = clamp(0.5 + 0.5 * sum / max(den, 0.00001), 0.0, 1.0);
  n = max(0.0, n - shelfAmt) / max(0.001, 1.0 - shelfAmt);
  n = pow(n, 1.0 / max(0.01, powerAmt));
  n = pow(n, max(0.01, plumeEmit.z));
  return pow(n, max(0.01, hdrPowerAmt));
}

void main() {
  vec2 p = (vertexPos.xy - 0.5) * plumeShapeB.z;
  p.y = -p.y; // retain the existing canvas-coordinate angle/curve convention
  float ca = cos(plumeShapeB.w), sa = sin(plumeShapeB.w);
  float axis = p.x * ca + p.y * sa;
  float crossAxis = -p.x * sa + p.y * ca;
  float pixel = max(length(dFdx(p)), length(dFdy(p)));
  float L = plumeShapeA.x, gap = plumeShapeA.y;
  vec3 accum = vec3(0.0);
  // Derivatives are evaluated before divergent branches for stable tiled export.
  float n = densityAt(p);
  for (int i = 0; i < 2; i++) {
    float sideSign = i == 0 ? 1.0 : -1.0;
    float bright = i == 0 ? 1.0 : 1.0 - plumeMore.y;
    float t = sideSign * axis - gap;
    float u = clamp(t / L, 0.0, 1.0);
    float launch = smoothstep(0.0, max(plumeMore.z, pixel), t);
    float endFade = smoothstep(0.0, max(L * 0.06, pixel), L - t);
    float d = sideSign * crossAxis - curveAt(max(0.0, t));
    float width = plumeShapeA.z + plumeShapeA.w * max(0.0, t);
    float bendSlope = 2.0 * plumeShapeB.y * max(0.0, t - plumeShapeB.x) / L;
    float transversePixel = pixel * sqrt(1.0 + bendSlope * bendSlope);
    float filteredWidth = sqrt(width * width + transversePixel * transversePixel / 12.0);
    float profile = exp(-pow(d / max(0.000001, filteredWidth), 2.0)) * width / filteredWidth;
    float emission = profile * max(0.0, n - plumeEmit.w * 0.5) * plumeEmit.x * launch * endFade;
    emission *= exp(-plumeMore.x * (1.0 - n));
    if (plumeTip.y > 0.0) emission *= 1.0 + 0.6 * pow(max(0.0, cos(u * 6.28318530718 * plumeTip.y)), 8.0);
    float colorT = plumeTip.z > 0.5 ? u : clamp(n, 0.0, 1.0);
    vec3 color = useRamp ? texture(rampTexture, vec2(colorT, 0.5)).rgb : mix(outerColor, innerColor, colorT);
    if (smokeEnabled) {
      emission *= smokeDensityAt(vertexPos.xy);
      color = smokeShade(vertexPos.xy, color);
    }
    accum += color * emission * bright;

    vec2 tip = sideSign * vec2(gap + L, curveAt(L));
    float dist = length(vec2(axis, crossAxis) - tip);
    float radius = max(pixel, plumeTip.x * L);
    float spotRadius = max(pixel, plumeShapeA.z * 1.5);
    float lobe = exp(-4.0 * pow(dist / radius, 2.0));
    float spot = exp(-4.0 * pow(dist / spotRadius, 2.0));
    vec3 tipColor = useRamp ? texture(rampTexture, vec2(1.0, 0.5)).rgb : innerColor;
    accum += (tipColor * lobe * 0.3 + mix(tipColor, vec3(1.0), spot) * spot * 0.6) * plumeMore.w * bright;
  }
  if (smokeEnabled) accum += smokeSources(vertexPos.xy);
  if (gap > 0.0) accum *= smoothstep(gap, gap + max(pixel, 0.000001), abs(axis));
  // No 8-bit bake or display clamp: HDR export retains plume radiance above 1.
  fragColor = vec4(accum * plumeEmit.y * hdrMultiplierAmt, 1.0);
}
`;
