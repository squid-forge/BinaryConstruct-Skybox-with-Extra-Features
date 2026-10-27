// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY, DISPLAY_STORAGE_KEY, readDisplayPreferences } from './displayPreferences';

describe('display preferences', () => {
  beforeEach(() => localStorage.clear());
  it('starts in HDR view without changing authored scene data', () => {
    expect(readDisplayPreferences()).toEqual(DEFAULT_DISPLAY);
  });
  it('restores standard view, exposure and mapping', () => {
    const display = { hdr: false, exposure: -3.25, mapping: 'linear' };
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(display));
    expect(readDisplayPreferences()).toEqual(display);
  });
  it('recovers from corrupt or out-of-range preferences', () => {
    localStorage.setItem(DISPLAY_STORAGE_KEY, '{bad');
    expect(readDisplayPreferences()).toEqual(DEFAULT_DISPLAY);
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ hdr: 'false', exposure: 1000, mapping: 'invalid' }));
    expect(readDisplayPreferences()).toEqual({ ...DEFAULT_DISPLAY, exposure: 12 });
    localStorage.setItem(DISPLAY_STORAGE_KEY, 'null');
    expect(readDisplayPreferences()).toEqual(DEFAULT_DISPLAY);
  });
});
