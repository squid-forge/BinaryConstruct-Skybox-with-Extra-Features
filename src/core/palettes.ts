/**
 * Astro palette presets for nebula color ramps, loosely derived from
 * narrowband channel-mapping conventions (Hubble SHO, JWST NIRCam) and
 * classic emission/reflection nebula photography.
 */
import { rgba, type RampStop } from './layers';

const stop = (t: number, r: number, g: number, b: number, a = 1): RampStop => ({
  t,
  color: rgba(r, g, b, a),
});

export const PALETTES: Record<string, RampStop[]> = {
  'Oxygen and warm dust': [stop(0, 0.012, 0.035, 0.055), stop(0.3, 0.025, 0.2, 0.28), stop(0.55, 0.2, 0.65, 0.8), stop(0.72, 0.85, 0.5, 0.32), stop(0.9, 1, 0.75, 0.58), stop(1, 0.85, 0.96, 1)],
  'Hydrogen / oxygen (HOO mapped)': [stop(0, 0.012, 0.005, 0.025), stop(0.3, 0.3, 0.018, 0.06), stop(0.55, 0.85, 0.08, 0.16), stop(0.72, 0.05, 0.5, 0.65), stop(0.9, 0.35, 0.9, 1), stop(1, 0.95, 0.97, 1)],
  'Sulfur / hydrogen / oxygen (SHO mapped)': [stop(0, 0.015, 0.025, 0.04), stop(0.3, 0.15, 0.13, 0.055), stop(0.5, 0.75, 0.4, 0.08), stop(0.68, 0.18, 0.65, 0.38), stop(0.85, 0.12, 0.65, 1), stop(1, 0.95, 0.98, 1)],
  'Hydrogen emission (red / pink)': [stop(0, 0.015, 0, 0.015), stop(0.4, 0.25, 0.006, 0.045), stop(0.7, 0.8, 0.025, 0.13), stop(0.9, 1, 0.25, 0.45), stop(1, 1, 0.8, 0.85)],
  'Oxygen III emission (teal)': [stop(0, 0, 0.015, 0.02), stop(0.4, 0.005, 0.2, 0.22), stop(0.75, 0.04, 0.7, 0.65), stop(1, 0.65, 1, 0.95)],
  'Orion inspired': [stop(0, 0.025, 0.01, 0.04), stop(0.35, 0.3, 0.03, 0.15), stop(0.6, 0.7, 0.16, 0.4), stop(0.82, 0.32, 0.65, 0.85), stop(1, 0.9, 0.95, 1)],
  'Carina inspired': [stop(0, 0.025, 0.015, 0.01), stop(0.35, 0.22, 0.08, 0.025), stop(0.6, 0.75, 0.34, 0.08), stop(0.8, 0.2, 0.55, 0.72), stop(1, 0.95, 0.88, 0.72)],
  'Hubble SHO': [
    stop(0, 0.01, 0.02, 0.05),
    stop(0.35, 0.05, 0.22, 0.29),
    stop(0.6, 0.24, 0.5, 0.48),
    stop(0.8, 0.85, 0.62, 0.28),
    stop(1, 1, 0.95, 0.82),
  ],
  'JWST NIR': [
    stop(0, 0.02, 0.01, 0.03),
    stop(0.35, 0.19, 0.08, 0.06),
    stop(0.6, 0.55, 0.26, 0.11),
    stop(0.82, 0.9, 0.65, 0.4),
    stop(1, 0.95, 0.9, 1),
  ],
  'H-alpha': [
    stop(0, 0.01, 0, 0.01),
    stop(0.4, 0.22, 0.02, 0.06),
    stop(0.7, 0.6, 0.1, 0.14),
    stop(0.9, 0.9, 0.35, 0.3),
    stop(1, 1, 0.78, 0.7),
  ],
  'Reflection blue': [
    stop(0, 0, 0.01, 0.03),
    stop(0.4, 0.04, 0.1, 0.28),
    stop(0.7, 0.2, 0.4, 0.75),
    stop(1, 0.8, 0.92, 1),
  ],
  'Emerald': [
    stop(0, 0, 0.02, 0.02),
    stop(0.45, 0.02, 0.2, 0.14),
    stop(0.75, 0.15, 0.55, 0.35),
    stop(1, 0.8, 1, 0.9),
  ],
};

/** Bake a ramp to a 256x1 RGBA byte LUT (linear interpolation, clamped ends). */
export function bakeRampLut(stops: RampStop[]): Uint8Array {
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let lo = sorted[0];
    let hi = sorted[sorted.length - 1];
    for (let s = 0; s < sorted.length - 1; s++) {
      if (t >= sorted[s].t && t <= sorted[s + 1].t) {
        lo = sorted[s];
        hi = sorted[s + 1];
        break;
      }
    }
    const span = hi.t - lo.t;
    const f = span > 0 ? Math.min(1, Math.max(0, (t - lo.t) / span)) : 0;
    out[i * 4] = Math.round((lo.color.r + f * (hi.color.r - lo.color.r)) * 255);
    out[i * 4 + 1] = Math.round((lo.color.g + f * (hi.color.g - lo.color.g)) * 255);
    out[i * 4 + 2] = Math.round((lo.color.b + f * (hi.color.b - lo.color.b)) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}
