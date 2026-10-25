/** Texture IDs stay unchanged in scene files; resolution is a loading concern. */
export const BUNDLED_TEXTURE_NAMES = [
  'default.png', 'flare-blue-purple1.png', 'flare-blue-purple2.png',
  'flare-blue-purple3.png', 'flare-blue-spikey1.png', 'flare-green1.png',
  'flare-inverted-blue-purple3.png', 'flare-red1.png', 'flare-red-yellow1.png',
  'flare-white-small1.png', 'sun.png', 'hdr-flare-white.exr', 'hdr-flare-white2.exr',
  'debug_back.png', 'debug_bottom.png', 'debug_front.png', 'debug_left.png',
  'debug_right.png', 'debug_top.png',
] as const;

const normalized = (id: string) => id.replace(/^user:/, '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
const basename = (id: string) => normalized(id).split('/').pop();

/** Accept legacy paths/case differences, but never choose between ambiguous files. */
export function resolveTextureReference(reference: string, userIds: string[]): string | undefined {
  if (!reference) return undefined;
  if (reference.startsWith('proc:')) return reference;
  const candidates: string[] = reference.startsWith('user:') ? userIds : [...BUNDLED_TEXTURE_NAMES, ...userIds];
  if (candidates.includes(reference)) return reference;
  const full = candidates.filter((candidate) => normalized(candidate) === normalized(reference));
  if (full.length) return full.length === 1 ? full[0] : undefined;
  const files = candidates.filter((candidate) => basename(candidate) === basename(reference));
  return files.length === 1 ? files[0] : undefined;
}

/** Unknown assignments must remain visible in a select instead of falling to None. */
export function assignedTextureOptions(options: { value: string; label: string }[], references: string[]) {
  const extra = [...new Set(references)].filter((id) => id && !options.some((option) => option.value === id));
  return [...options, ...extra.map((id) => ({ value: id, label: `Assigned: ${id}` }))];
}
