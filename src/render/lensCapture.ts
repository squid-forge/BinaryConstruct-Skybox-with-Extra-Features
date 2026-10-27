export type LensResolution = number | 'native';

/** Shared by export and its UI so background-detail limits are explicit. */
export function lensCaptureSettings(size: number, lensCount: number, requested?: LensResolution) {
  const count = Math.max(0, Math.floor(lensCount));
  const budgetSize = Math.sqrt(64 * 1024 * 1024 / (6 * 8 * Math.max(1, count)));
  const resolution = requested === 'native' ? size : requested;
  if (resolution !== undefined && (!Number.isInteger(resolution) || resolution < 16 || (resolution & (resolution - 1)) !== 0)) {
    throw new Error('Lens capture resolution must be a power of two');
  }
  const faceSize = resolution === undefined
    ? Math.max(16, Math.min(size, 1024, 2 ** Math.floor(Math.log2(budgetSize))))
    : Math.min(size, resolution);
  const bytesPerLens = 6 * 8 * faceSize ** 2;
  return { faceSize, bytesPerLens, totalBytes: count * bytesPerLens, reduced: count > 0 && faceSize < size };
}
