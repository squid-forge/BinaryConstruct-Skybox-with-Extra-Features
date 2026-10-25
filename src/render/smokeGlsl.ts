// Shared optional smoke surface for local clouds, sky bands, volumes and jets.
// Perlin helpers are supplied by NOISE_COMMON. Coordinates are local to each effect.
export const SMOKE_GLSL = /* glsl */ `
uniform bool smokeEnabled;
uniform bool smokeSpherical;
uniform bool smokeHasMask;
uniform sampler2D smokeTexture;
uniform vec4 smokeShape; // style, mask scale, erosion, feather
uniform vec4 smokeMedium; // density, depth, absorption, shadow
uniform vec4 smokeLook; // ambient, shafts, saturation, unused
uniform vec4 smokeLight1;
uniform vec4 smokeLight2;
uniform vec3 smokeColor1;
uniform vec3 smokeColor2;
uniform vec4 smokeRadial; // enabled, outer radius, inner cavity, falloff
uniform vec4 smokeSource; // visible, radius, glow, unused

vec3 smokeDirection(vec2 uv) {
  float lon = (uv.x - 0.5) * 6.28318530718;
  float lat = (uv.y - 0.5) * 3.14159265359;
  return vec3(cos(lat) * sin(lon), sin(lat), -cos(lat) * cos(lon));
}
vec2 smokeDelta(vec2 from, vec2 to) {
  vec2 delta = to - from;
  if (smokeSpherical) delta.x -= floor(delta.x + 0.5);
  return delta;
}

float smokeFootprint(vec2 uv) {
  float edge = max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0;
  float footprint = smokeSpherical ? 1.0 : 1.0 - smoothstep(1.0 - smokeShape.w, 1.0, edge);
  if (smokeRadial.x > 0.5) {
    float radius = length((uv - 0.5) * 2.0) / smokeRadial.y;
    footprint *= pow(max(0.0, 1.0 - radius * radius), smokeRadial.w);
    if (smokeRadial.z > 0.0) footprint *= smoothstep(smokeRadial.z, smokeRadial.z + smokeShape.w, radius);
  }
  return footprint;
}

float smokeStamp(vec2 coordinate) {
  vec2 q = fract(coordinate);
  // Particle masks have transparent borders: repeating them directly cuts a
  // rectangular grid through a band. Crossfade overlapping half-tile stamps
  // so each border is covered by the interior of its neighbour. The weights
  // have zero slope at the joins, preserving smooth density and shadow rays.
  vec2 shifted = fract(q + 0.5);
  vec2 weight = 0.5 - 0.5 * cos(q * 6.28318530718);
  float a = texture(smokeTexture, q).a;
  float b = texture(smokeTexture, vec2(shifted.x, q.y)).a;
  float c = texture(smokeTexture, vec2(q.x, shifted.y)).a;
  float d = texture(smokeTexture, shifted).a;
  return mix(mix(d, c, weight.x), mix(b, a, weight.x), weight.y);
}

float smokeMaskAt(vec2 uv) {
  if (smokeSpherical) {
    float footprint = smokeFootprint(uv);
    if (!smokeHasMask) return footprint;
    // Direction-based triplanar stamps remain continuous across longitude and
    // cube-face boundaries, including non-integer mask scales.
    vec3 d = smokeDirection(uv);
    vec3 weights = pow(abs(d), vec3(4.0));
    weights /= max(0.00001, weights.x + weights.y + weights.z);
    float scale = smokeShape.y * 0.5;
    return footprint * dot(weights, vec3(smokeStamp(d.yz * scale + 0.5), smokeStamp(d.zx * scale + 0.5), smokeStamp(d.xy * scale + 0.5)));
  }
  vec2 q = (uv - 0.5) * smokeShape.y + 0.5;
  if (any(lessThan(q, vec2(0.0))) || any(greaterThan(q, vec2(1.0)))) return 0.0;
  float feather = smokeFootprint(uv);
  if (!smokeHasMask) return feather;
  // Three differently oriented stamps avoid a single obvious particle silhouette.
  float a = texture(smokeTexture, q).a;
  float b = texture(smokeTexture, vec2(q.y, 1.0-q.x)).a;
  return max(a, b * 0.8) * feather;
}
float smokeStructure(vec2 uv) {
  vec3 q = vec3((uv - 0.5) * noiseScale * 2.0, 7.31);
  if (smokeSpherical) q = smokeDirection(uv) * noiseScale * 2.0 + vec3(0.0, 0.0, 7.31);
  q += warpStrength * fbm3(q * warpScale, 2, lacunarity, gain);
  float v = fbmNoise(q, 3, lacunarity, gain);
  if (smokeShape.x > 0.5 && smokeShape.x < 1.5) v = 1.0 - 2.0 * abs(v);
  if (smokeShape.x > 1.5 && smokeShape.x < 2.5) v = ridgedFbmNoise(q, 3, lacunarity, gain, offset) * 2.0 - 0.5;
  if (smokeShape.x > 2.5) v = abs(v) * 2.5 - 0.5;
  return clamp(v * 0.5 + 0.5, 0.0, 1.0);
}
float smokeDensityAt(vec2 uv) {
  float n = smokeStructure(uv);
  float eroded = smoothstep(smokeShape.z * 0.7, smokeShape.z * 0.7 + 0.28, n);
  return smokeMaskAt(uv) * eroded * (0.25 + 0.75 * n) * smokeMedium.x;
}
float smokeTransmission(vec2 uv, vec4 light) {
  if (smokeMedium.w <= 0.0 || light.w <= 0.0) return 1.0;
  float opticalDepth = 0.0;
  if (smokeSpherical) {
    vec3 origin = smokeDirection(uv);
    vec3 delta = smokeDirection(light.xy) * (1.0 + light.z * 0.5) - origin;
    for (int i = 1; i <= 6; i++) {
      vec3 point = origin + delta * (float(i) / 7.0);
      float radius = length(point);
      if (radius < 0.00001) continue;
      vec3 direction = point / radius;
      vec2 sampleUV = vec2(atan(direction.x, -direction.z) / 6.28318530718 + 0.5, asin(clamp(direction.y, -1.0, 1.0)) / 3.14159265359 + 0.5);
      float slab = 1.0 - smoothstep(smokeMedium.y * 0.5, smokeMedium.y, abs(radius - 1.0));
      opticalDepth += smokeDensityAt(sampleUV) * slab;
    }
    return exp(-opticalDepth * length(delta) * smokeMedium.w / 6.0);
  }
  vec2 delta = smokeDelta(uv, light.xy);
  for (int i = 1; i <= 6; i++) {
    float t = float(i) / 7.0;
    // Escape the finite depth slab as the ray approaches an elevated light.
    float height = abs(light.z) * t;
    float slab = 1.0 - smoothstep(smokeMedium.y * 0.5, smokeMedium.y, height);
    opticalDepth += smokeDensityAt(uv + delta * t) * slab;
  }
  return exp(-opticalDepth * length(vec3(delta, light.z)) * smokeMedium.w / 6.0);
}
vec3 smokeIllumination(vec2 uv) {
  vec3 illumination = vec3(smokeLook.x);
  for (int i = 0; i < 2; i++) {
    vec4 light = i == 0 ? smokeLight1 : smokeLight2;
    if (light.w <= 0.0) continue;
    vec3 tint = i == 0 ? smokeColor1 : smokeColor2;
    vec2 delta = smokeDelta(uv, light.xy);
    float distance2 = dot(delta, delta) + light.z * light.z;
    if (smokeSpherical) {
      vec3 separation = smokeDirection(light.xy) - smokeDirection(uv);
      distance2 = dot(separation, separation) * 0.25 + light.z * light.z;
    }
    float transmission = smokeTransmission(uv, light);
    float shaft = pow(transmission, 2.0) * smokeLook.y;
    illumination += tint * light.w * (transmission + shaft) / (1.0 + distance2 * 8.0);
  }
  return illumination;
}
vec3 smokeShade(vec2 uv, vec3 color) {
  vec3 lit = color * smokeIllumination(uv) * exp(-smokeDensityAt(uv) * smokeMedium.z * smokeMedium.y * 0.1);
  float luminance = dot(lit, vec3(0.2126, 0.7152, 0.0722));
  return max(vec3(0.0), mix(vec3(luminance), lit, smokeLook.z));
}
vec3 smokeSources(vec2 uv) {
  if (smokeSource.x < 0.5) return vec3(0.0);
  vec3 radiance = vec3(0.0);
  float pixel = max(length(dFdx(uv)), length(dFdy(uv)));
  float radius = max(smokeSource.y, pixel);
  for (int i = 0; i < 2; i++) {
    vec4 light = i == 0 ? smokeLight1 : smokeLight2;
    vec3 tint = i == 0 ? smokeColor1 : smokeColor2;
    float d = length(smokeDelta(uv, light.xy));
    if (smokeSpherical) d = acos(clamp(dot(smokeDirection(uv), smokeDirection(light.xy)), -1.0, 1.0)) / 6.28318530718;
    float core = exp(-4.0 * d * d / (radius * radius));
    float halo = exp(-4.0 * d * d / (radius * radius * 64.0)) * smokeSource.z;
    radiance += (mix(tint, vec3(1.0), core) * core + tint * halo * 0.2) * light.w;
  }
  return radiance;
}
`;
