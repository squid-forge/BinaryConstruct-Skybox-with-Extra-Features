/**
 * Loader/cache for the bundled flare textures (public/media/textures/).
 * PNG via TextureLoader; the two HDR flares (.exr) via EXRLoader.
 *
 * The cache is deliberately app-lifetime: the flare set is small (~18 files)
 * and shared across PreviewScene instances (React StrictMode remounts would
 * otherwise race a disposed texture). Nothing here needs per-scene disposal.
 */
import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { bakeProceduralFlare } from './proceduralFlares';
import { resolveTextureReference } from '../assets/textureReferences';

const cache = new Map<string, Promise<THREE.Texture | null>>();

// injected by the sprite store to avoid a circular import
let resolveUserSprite: ((id: string) => { id: string; url: string } | undefined) | null = null;
export function setUserSpriteResolver(fn: (id: string) => { id: string; url: string } | undefined): void {
  resolveUserSprite = fn;
}

/** Drop a cached texture (re-upload / delete of a user sprite). */
export function invalidateFlareTexture(name: string): void {
  cache.delete(name);
}

export function loadFlareTexture(name: string): Promise<THREE.Texture | null> {
  const user = resolveUserSprite?.(name);
  const resolved = user?.id ?? resolveTextureReference(name, []);
  if (!resolved) return Promise.resolve(null);
  let promise = cache.get(resolved);
  if (promise) return promise;

  // procedural flares bake synchronously to a canvas (pre-step before use)
  if (resolved.startsWith('proc:')) {
    promise = Promise.resolve(bakeProceduralFlare(resolved));
    cache.set(resolved, promise);
    return promise;
  }

  // user-uploaded sprites resolve via their object URL
  if (user) {
    promise = new THREE.TextureLoader()
      .loadAsync(user.url)
      .then((tex) => {
        tex.colorSpace = THREE.NoColorSpace;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        return tex;
      })
      .catch(() => null);
    cache.set(resolved, promise);
    return promise;
  }

  const url = `${import.meta.env.BASE_URL}media/textures/${resolved}`;
  const loader = resolved.toLowerCase().endsWith('.exr')
    ? new EXRLoader()
    : new THREE.TextureLoader();

  promise = loader
    .loadAsync(url)
    .then((tex) => {
      tex.colorSpace = THREE.NoColorSpace;
      // No mipmaps: minified mip levels average the bright flare center into
      // the (pure black) border texels, which shows up as a faint additive
      // square around every small flare quad.
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    })
    .catch((err) => {
      console.warn(`flare texture ${name} failed to load`, err);
      return null;
    });

  cache.set(resolved, promise);
  return promise;
}
