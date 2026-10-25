import type { SmokeParams } from '../core/layers';
import { PerlinNoise } from '../core/perlin';

const masks = new Map<string, { width: number; height: number; alpha: Uint8ClampedArray }>();
let loading: Promise<void> | undefined;
/** The PCG preview refreshes after these bundled masks arrive; baking awaits them. */
export function loadSmokePixels(): Promise<void> {
  return loading ??= Promise.all(['puff', 'billow', 'wisps', 'burst'].map(async name => {
    const image = new Image(); image.src = `${import.meta.env.BASE_URL}masks/smoke/${name}.png`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    masks.set(name, { width: image.width, height: image.height, alpha: ctx.getImageData(0, 0, image.width, image.height).data });
  })).then(() => {}).catch(error => { loading = undefined; throw error; });
}
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
export function applySmokeToCanvas(canvas: HTMLCanvasElement, p: SmokeParams, seed: number, scale = 5) {
  if (!p.smokeEnabled) return;
  const ctx = canvas.getContext('2d')!, w = canvas.width, h = canvas.height;
  const image = ctx.getImageData(0, 0, w, h), pixels = image.data;
  const field = new Float32Array(w * h), noise = new PerlinNoise((seed + 0x739b) >>> 0);
  const mask = masks.get(p.cloudMask ?? ''), maskScale = clamp(p.cloudMaskScale ?? 1, 0.1, 10);
  const sampleMask = (x: number, y: number) => {
    x = (x - 0.5) * maskScale + 0.5; y = (y - 0.5) * maskScale + 0.5;
    if (x < 0 || x > 1 || y < 0 || y > 1) return 0;
    if (!mask) return 1;
    const tap = (u: number, v: number) => mask.alpha[(Math.min(mask.height - 1, Math.floor(v * mask.height)) * mask.width + Math.min(mask.width - 1, Math.floor(u * mask.width))) * 4 + 3] / 255;
    return Math.max(tap(x, y), tap(y, 1 - x) * 0.8);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w, v = (y + 0.5) / h;
    let n = noise.fbm(u * scale * 2, v * scale * 2, 7.31, 3, 0.5, 2);
    if (p.cloudStyle === 1) n = 1 - 2 * Math.abs(n);
    if (p.cloudStyle === 2) n = noise.ridgedFbm(u * scale * 2, v * scale * 2, 7.31, 3, 0.5, 2, 1) * 2 - 0.5;
    if (p.cloudStyle === 3) n = Math.abs(n) * 2.5 - 0.5;
    n = clamp(n * 0.5 + 0.5);
    let erosion = clamp((n - (p.cloudErosion ?? 0.5) * 0.7) / 0.28); erosion *= erosion * (3 - 2 * erosion);
    const edge = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
    let feather = clamp((1 - edge) / clamp(p.cloudFeather ?? 0.16, 0.01, 1)); feather *= feather * (3 - 2 * feather);
    if (p.cloudRadial) {
      const radius = Math.hypot((u - 0.5) * 2, (v - 0.5) * 2) / clamp(p.cloudRadius ?? 1, 0.05, 2);
      feather *= Math.pow(Math.max(0, 1 - radius * radius), clamp(p.cloudRadialFalloff ?? 0.4, 0.01, 8));
      if ((p.cloudInnerRadius ?? 0) > 0) {
        let cavity = clamp((radius - (p.cloudInnerRadius ?? 0)) / clamp(p.cloudFeather ?? 0.16, 0.01, 1));
        cavity *= cavity * (3 - 2 * cavity); feather *= cavity;
      }
    }
    field[y * w + x] = feather * sampleMask(u, v) * erosion * (0.25 + 0.75 * n) * clamp(p.cloudDensity ?? 2.5, 0, 100);
  }
  const sample = (u: number, v: number) => u < 0 || v < 0 || u >= 1 || v >= 1 ? 0 : field[Math.floor(v * h) * w + Math.floor(u * w)];
  const lights = [
    { x: (p.cloudLightX ?? -0.15) + 0.5, y: 0.5 - (p.cloudLightY ?? 0.05), z: p.cloudLightZ ?? 0.6, power: p.cloudLightPower ?? 2.5, color: p.cloudLightColor ?? { r: 0.5, g: 0.8, b: 1 } },
    { x: (p.cloudLight2X ?? 0.35) + 0.5, y: 0.5 - (p.cloudLight2Y ?? -0.2), z: p.cloudLight2Z ?? 0.3, power: p.cloudLight2Power ?? 1, color: p.cloudLight2Color ?? { r: 1, g: 0.35, b: 0.12 } },
  ];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const index = y * w + x, i = index * 4, u = (x + 0.5) / w, v = (y + 0.5) / h;
    const light = [p.cloudAmbient ?? 0.5, p.cloudAmbient ?? 0.5, p.cloudAmbient ?? 0.5];
    for (const source of lights) {
      if (source.power <= 0) continue;
      const dx = source.x - u, dy = source.y - v, distance = Math.hypot(dx, dy, source.z);
      let optical = 0;
      for (let k = 1; k <= 6; k++) {
        const t = k / 7, depth = clamp(p.cloudDepth ?? 0.6, 0.01, 5);
        optical += sample(u + dx * t, v + dy * t) * clamp((depth - Math.abs(source.z) * t) / (depth * 0.5));
      }
      const transmission = Math.exp(-optical * distance * clamp(p.cloudShadow ?? 2, 0, 100) / 6);
      const strength = source.power * (transmission + transmission * transmission * (p.cloudShafts ?? 0.8)) / (1 + distance * distance * 8);
      light[0] += source.color.r * strength; light[1] += source.color.g * strength; light[2] += source.color.b * strength;
    }
    const d = field[index], opacity = 1 - Math.exp(-d * (p.cloudDepth ?? 0.6));
    const extinction = Math.exp(-d * (p.cloudAbsorption ?? 1.8) * 0.1);
    const color = [pixels[i] * light[0], pixels[i + 1] * light[1], pixels[i + 2] * light[2]];
    const luma = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
    for (let c = 0; c < 3; c++) pixels[i + c] = clamp((luma + (color[c] - luma) * (p.cloudSaturation ?? 1.2)) * opacity * extinction, 0, 255);
    // Baked additive sprites keep black outside their emitting smoke. Use native
    // cloud layers for live extinction against unrelated background layers.
  }
  ctx.putImageData(image, 0, 0);
  if (p.cloudLightVisible) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const radius = clamp(p.cloudLightRadius ?? 0.012, 0.001, 0.5) * Math.min(w, h);
    const glow = clamp(p.cloudLightGlow ?? 0.7, 0, 10);
    for (const source of lights) {
      if (source.power <= 0) continue;
      const x = source.x * w, y = source.y * h, extent = radius * 8;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, extent);
      const alpha = clamp(source.power * 0.3), tint = source.color;
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(0.1, `rgba(${tint.r * 255},${tint.g * 255},${tint.b * 255},${alpha})`);
      gradient.addColorStop(0.5, `rgba(${tint.r * 255},${tint.g * 255},${tint.b * 255},${clamp(glow * source.power * 0.03)})`);
      gradient.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gradient;
      ctx.fillRect(x - extent, y - extent, extent * 2, extent * 2);
    }
    ctx.restore();
  }
}
