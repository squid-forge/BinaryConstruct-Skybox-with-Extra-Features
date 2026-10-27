export interface DisplayPreferences {
  hdr: boolean;
  exposure: number;
  mapping: 'reinhard' | 'linear';
}

export const DISPLAY_STORAGE_KEY = 'skybox.display';
export const DEFAULT_DISPLAY: DisplayPreferences = { hdr: true, exposure: 0, mapping: 'reinhard' };

export function readDisplayPreferences(): DisplayPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(DISPLAY_STORAGE_KEY) ?? '{}');
    return {
      hdr: typeof saved?.hdr === 'boolean' ? saved.hdr : true,
      exposure: typeof saved?.exposure === 'number' && Number.isFinite(saved.exposure) ? Math.max(-12, Math.min(12, saved.exposure)) : 0,
      mapping: saved?.mapping === 'linear' ? 'linear' : 'reinhard',
    };
  } catch { return { ...DEFAULT_DISPLAY }; }
}
