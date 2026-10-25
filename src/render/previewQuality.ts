export const PREVIEW_QUALITY = {
  low: { scale: 0.5, dpr: 1, pixels: 1024 * 1024, cube: 128, lens: 128, panorama: 128 },
  medium: { scale: 0.75, dpr: 1, pixels: 2 * 1024 * 1024, cube: 256, lens: 256, panorama: 256 },
  high: { scale: 1, dpr: 1.5, pixels: 4 * 1024 * 1024, cube: Infinity, lens: 1024, panorama: 512 },
} as const;
export type PreviewQuality = keyof typeof PREVIEW_QUALITY;

export function previewPixelRatio(quality: PreviewQuality, deviceRatio: number, width: number, height: number) {
  const profile = PREVIEW_QUALITY[quality];
  return Math.min(deviceRatio, profile.dpr, Math.sqrt(profile.pixels / Math.max(1, width * height))) * profile.scale;
}
