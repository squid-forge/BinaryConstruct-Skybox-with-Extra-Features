import { describe, expect, it } from 'vitest';
import { plumeCurve, plumeFrame, plumePoint, plumeShapeFromParams, nativePlumeParams, nativePlumeEdge, type PlumeShape } from './plumeGeometry';
const base: PlumeShape = { length: 1, gap: 0.25, width: 0.02, coneDeg: 10, curveStart: 0.3, curve: 1.5, tipSize: 0.2 };
describe('detached curved plumes', () => {
  it('starts at the configured gap and stays straight until the curve delay', () => {
    expect(plumePoint(0, 1, 0, base)).toEqual([0.25, 0]);
    expect(plumeCurve(0.3, base)).toBe(0);
    expect(plumeCurve(0.300001, base)).toBeLessThan(1e-10);
    expect(plumeCurve(0.8, base)).toBeCloseTo(0.375);
  });
  it('keeps opposite jets symmetric through rotation and curvature', () => {
    const a = plumePoint(0.8, 1, 0.7, base), b = plumePoint(0.8, -1, 0.7, base);
    expect(a[0]).toBe(-b[0]); expect(a[1]).toBe(-b[1]);
  });
  it('fits extremely long, wide, curved plumes inside the sprite', () => {
    for (const length of [0.01, 1, 20, 10000]) for (const coneDeg of [0, 45, 89.5]) {
      const shape = { ...base, length, coneDeg };
      const frame = plumeFrame(shape);
      expect(Number.isFinite(frame)).toBe(true);
      for (const t of [0, length / 2, length]) {
        const point = plumePoint(t, 1, 1.2, shape);
        expect(Math.hypot(...point) / frame).toBeLessThanOrEqual(0.43);
      }
      const width = shape.width + Math.tan(coneDeg * Math.PI / 180) * length;
      expect(width * 3 / frame).toBeLessThan(0.44);
    }
  });
});


describe('native black-hole plume dimensions', () => {
  it('maps independent length, width and gap from horizon radii into shared geometry', () => {
    const input = { jetLength: 12, jetGap: 3, jetCurveStart: 4, jetWidth: 0.5, jetLaunchFade: 0.4 };
    const p = nativePlumeParams(input), shape = plumeShapeFromParams(p);
    expect(shape.length).toBeCloseTo(1.2); expect(shape.gap).toBeCloseTo(0.3);
    expect(shape.curveStart).toBeCloseTo(0.4); expect(shape.width).toBeCloseTo(0.05);
    expect(p.jetLaunchFade).toBeCloseTo(0.04);
    const frame = plumeFrame(shape), edge = nativePlumeEdge(input);
    // Texture-normalized launch coordinate times the world edge gives the requested radii.
    expect(shape.gap / frame * edge).toBeCloseTo(3);
    expect(shape.length / frame * edge).toBeCloseTo(12);
    expect(nativePlumeEdge({ ...input, jetSize: 2 })).toBeCloseTo(edge * 2);
  });
  it('grows the jet extent without changing the horizon scale', () => {
    const short = { jetLength: 8, jetGap: 2 }, long = { jetLength: 80, jetGap: 2 };
    for (const input of [short, long]) {
      const shape = plumeShapeFromParams(nativePlumeParams(input));
      expect(shape.gap / plumeFrame(shape) * nativePlumeEdge(input)).toBeCloseTo(2);
    }
    expect(nativePlumeEdge(long)).toBeGreaterThan(nativePlumeEdge(short));
  });
});
