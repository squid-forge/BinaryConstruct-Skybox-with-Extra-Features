import { NATIVE_PLUME_DEFAULTS, type NebulaPlumeParams } from '../core/layers';

/** Geometry in unscaled sprite-radius units; framing is independent of shape. */
export interface PlumeShape {
  length: number;
  gap: number;
  width: number;
  coneDeg: number;
  curveStart: number;
  curve: number;
  tipSize: number;
}

export function plumeCurve(t: number, shape: PlumeShape): number {
  const travel = Math.max(0, t - shape.curveStart);
  return shape.curve * travel * travel / Math.max(0.0001, shape.length);
}

export function plumePoint(t: number, sign: number, angle: number, shape: PlumeShape): [number, number] {
  const x = shape.gap + t, y = plumeCurve(t, shape);
  return [sign * (x * Math.cos(angle) - y * Math.sin(angle)), sign * (x * Math.sin(angle) + y * Math.cos(angle))];
}

export function plumeFrame(shape: PlumeShape): number {
  const width = shape.width + Math.tan(shape.coneDeg * Math.PI / 180) * shape.length;
  const radius = Math.hypot(shape.gap + shape.length, Math.abs(plumeCurve(shape.length, shape))) +
    Math.max(width * 3, shape.tipSize * shape.length * 2);
  return Math.max(1, radius / 0.43);
}


const finite = (n: number | undefined, fallback: number, lo = 0, hi = 1e6) =>
  Math.max(lo, Math.min(hi, Number.isFinite(n) ? n! : fallback));

/** The reference width remains 384px even when a native texture is higher resolution. */
export function plumeShapeFromParams(p: NebulaPlumeParams): PlumeShape {
  return {
    length: finite(p.jetLength, 0.42, 0.001), gap: finite(p.jetGap, 0),
    width: finite(p.jetWidth, 5, 0.01) / 384,
    coneDeg: finite(p.jetConeDeg, 3.43, 0, 89.5),
    curveStart: finite(p.jetCurveStart, 0), curve: finite(p.jetCurve, 0, -100, 100),
    tipSize: finite(p.tipSize, 0.22, 0.001, 10),
  };
}

/** Map native horizon-radius units onto the shared generator's reference units. */
export function nativePlumeParams(layer: NebulaPlumeParams): NebulaPlumeParams {
  return {
    ...NATIVE_PLUME_DEFAULTS,
    ...Object.fromEntries(Object.entries(layer).filter(([, value]) => value !== undefined)),
    jetLength: finite(layer.jetLength, 8, 0.01) / 10,
    jetGap: finite(layer.jetGap, 2) / 10,
    jetCurveStart: finite(layer.jetCurveStart, 2) / 10,
    jetWidth: finite(layer.jetWidth, 0.45, 0.001) * 384 / 10,
    jetLaunchFade: finite(layer.jetLaunchFade, 0.3, 0.001) / 10,
    jetAsymmetry: layer.jetAsymmetry ?? 0.2,
    jetDensity: layer.jetDensity ?? 2.5,
    jetWarp: layer.jetWarp ?? 0.5,
  };
}

/** Full texture edge measured in horizon radii; framing never resizes the horizon. */
export function nativePlumeEdge(layer: NebulaPlumeParams & { jetSize?: number }): number {
  return 10 * plumeFrame(plumeShapeFromParams(nativePlumeParams(layer))) * finite(layer.jetSize, 1, 0.001, 1000);
}
