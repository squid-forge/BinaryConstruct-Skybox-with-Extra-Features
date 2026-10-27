/** Do not let the driver silently shrink raster source images during export. */
export function assertExportTextureSize(texture: { image: unknown } | null, name: string, limit: number): void {
  if (!texture?.image || typeof texture.image !== 'object') return;
  const image = texture.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
  const width = image.naturalWidth || image.width || 0, height = image.naturalHeight || image.height || 0;
  if (width > limit || height > limit) {
    throw new Error(`Source image "${name}" is ${width} × ${height}, exceeding this GPU's ${limit}px texture limit. Export stopped to avoid silently reducing source detail. Use a smaller source image or a GPU with a higher texture limit.`);
  }
}
