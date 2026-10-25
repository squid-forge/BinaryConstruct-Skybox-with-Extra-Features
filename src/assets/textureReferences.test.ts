import { describe, expect, it } from 'vitest';
import { assignedTextureOptions, resolveTextureReference } from './textureReferences';

describe('imported template image references', () => {
  it('resolves bundled images from legacy paths and case differences', () => {
    for (const reference of ['media/textures/flare-red1.png', 'C:\\Spacescape\\textures\\FLARE-RED1.PNG', './flare-red1.png']) {
      expect(resolveTextureReference(reference, [])).toBe('flare-red1.png');
    }
  });
  it('restores embedded PNG filenames without requiring user: prefixes', () => {
    const assets = ['user:images/planet.png'];
    expect(resolveTextureReference('planet.png', assets)).toBe(assets[0]);
    expect(resolveTextureReference('C:\\old\\PLANET.PNG', assets)).toBe(assets[0]);
    expect(resolveTextureReference('user:images/planet.png', assets)).toBe(assets[0]);
  });
  it('does not replace explicitly user-owned images with bundled namesakes', () => {
    expect(resolveTextureReference('user:default.png', [])).toBeUndefined();
    expect(resolveTextureReference('default.png', ['user:default.png'])).toBe('default.png');
  });
  it('does not guess between ambiguous image filenames', () => {
    const assets = ['user:a/planet.png', 'user:b/planet.png'];
    expect(resolveTextureReference('planet.png', assets)).toBeUndefined();
    expect(resolveTextureReference('a/planet.png', assets)).toBe(assets[0]);
  });
  it('keeps assigned unknown values visible instead of showing None', () => {
    const options = assignedTextureOptions([{ value: '', label: '(none)' }], ['C:\\old\\planet.png', 'C:\\old\\planet.png']);
    expect(options).toHaveLength(2);
    expect(options[1].value).toBe('C:\\old\\planet.png');
  });
});
