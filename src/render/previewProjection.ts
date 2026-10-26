export type PreviewProjection = 'placement' | '3d' | '2d';

export const PLACEMENT_ZOOM_LEVELS = [15, 30, 45, 60, 70] as const;
export const WIDE_ZOOM_LEVELS = [15, 30, 45, 60, 80, 100, 120] as const;

/** Bound both axes in placement mode, including on ultrawide monitors. */
export function previewVerticalFov(fov: number, aspect: number, placement: boolean): number {
  if (!placement || aspect <= 1) return fov;
  return 2 * Math.atan(Math.tan(fov * Math.PI / 360) / aspect) * 180 / Math.PI;
}
