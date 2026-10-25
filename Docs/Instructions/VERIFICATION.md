# Verification recipes

Run these checks before publishing changes. Browser verification scripts
create fresh output under Docs/Research; generated captures are not published.

## Gates (all must pass before "done")

```powershell
npm test        # vitest, node env — no canvas/GL, pure core + export logic
npm run build   # tsc -b && vite build — type errors surface here, not in dev
npm run lint    # oxlint
```

Vitest excludes `.local-review/**` so local archives and prepared copies do
not duplicate the test suite.

## Visual verification (the part tests can't cover)

Playwright + chromium are dev-dependencies and installed. Serve the built
app, drive the real UI, screenshot, and **look at the PNGs** — WebGL2 (and
the bake pipeline) runs fine in headless chromium via SwiftShader.

```js
// scratch-*.mjs in the repo root (delete before committing)
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:4189/?preset=gargantua'); // ?preset= picks any bundled preset
await page.waitForTimeout(2500);                            // let the bake settle
await page.locator('img.gen-preview').screenshot({ path: 'out.png' }); // workbench sprite
await page.locator('.viewport canvas').screenshot({ path: 'sky.png' }); // live sky
```

- Serve with `npm run preview -- --port 4189 --strictPort` (dist is static —
  a rebuild is picked up without restarting the server).
- Sidebar buttons: `getByRole('button', { name: 'Stars', exact: true })`
  (exact — "+stars" collides), sliders/selects via `getByLabel(...)` in the
  inspector/workbench (controls.tsx wires htmlFor). Export checkboxes now have
  associated labels; use `getByLabel('Memory-saving export', { exact: true })`
  or IDs `#export-faces`, `#export-png`, `#export-hdr`, `#export-exr`,
  `#export-per-layer` instead of positional checkbox indices.
- Downloads: `page.waitForEvent('download')` then `download.saveAs(...)`,
  unzip and probe contents with node.

## High-resolution memory-saving export

Build and serve `dist` as above, then run:

```powershell
node Docs/Instructions/verify-streaming-export.mjs
node Docs/Instructions/verify-streaming-special-cases.mjs
$env:HIGH_RES='1'
$env:HIGH_CUBE='1'
node Docs/Instructions/verify-streaming-export.mjs
```

The default run checks PNG/HDR/EXR, legacy visual comparison, repeated-export
determinism, batch/per-layer archives and cancellation. HIGH_RES adds actual
8192 × 4096 and 16384 × 8192 panorama downloads; HIGH_CUBE adds all six
16384 × 16384 PNG cube faces. Large cases take time and temporary disk space.
Chrome is used when Playwright's bundled browser is absent; override with
PLAYWRIGHT_CHANNEL. Inspect the resulting screenshots/thumbnails under
`Docs/Research/2026-10-22-streaming-export/`. Sampled JS heap/backing storage
metrics do not measure total browser/driver memory.

## Determinism spot-check

Two independent export runs of the same preset/seed must be byte-identical
(`diff -r` on unzipped batches). `rg "Math.random" src` must stay empty —
all randomness flows from MsvcRng / PerlinNoise seeds.

## Gotchas learned the hard way

- Volumetric `powerAmount` is `pow(n, 1.0 / power)` — LOWER values sparsify,
  higher values thicken toward fog (opposite of intuition).
- Black-hole lens captures depend on viewport size; anything that changes
  how the scene renders (resize, async textures) must re-run prepares.
- Additive (one/one) layers ignore texture alpha — sprites for them must be
  flattened onto opaque black (see flattenOntoBlack in genCommon).


## Galactic nebulae, jets and HDR softness

Build and serve dist on port 4189, then run:

```powershell
node Docs/Instructions/verify-galactic-jets-hdr.mjs
node Docs/Instructions/verify-hdr-softness.mjs
$env:NATIVE='1'
node Docs/Instructions/verify-hdr-softness.mjs
Remove-Item Env:NATIVE
node Docs/Instructions/compare-hdr-softness.mjs
```

Set HIGH_RES=1 for real 8192/16384-face HDR attempts. These require browser
storage quota as well as disk space. The October 24 16K-face attempt hit
QuotaExceededError; see that session's research results for the precise limit.
Inspect screenshots under Docs/Research/2026-10-24-galactic-jets-hdr/.


## Stacked bands and detached curved plumes

After building and serving dist on port 4189, run
`node Docs/Instructions/verify-galactic-stacks-plumes.mjs`.
Inspect the PNGs in `Docs/Research/2026-10-24-galactic-stacks-plumes/`.
The checks cover core shape/halo, stack independence, ordinary PCG black-hole
jets, the launch gap, restored-settings determinism, extreme framing, standalone
nebula color bands, and baking/placing/resizing the resulting sprite.


## Built-in black-hole stacks, procedural quality and HDR preview

After building and serving dist on port 4189:

```powershell
node Docs/Instructions/verify-native-black-hole-jets.mjs
node Docs/Instructions/verify-native-jet-quality.mjs
node Docs/Instructions/verify-hdr-preview.mjs
```

The first script uses Chrome/SwiftShader by default for byte-exact repeat HDR
checks, plus native stack save/load, visibility, dragging, cancellation recovery
and multiple lenses. HARDWARE_RENDERER=1 opts into device rendering; see the GPU
precision follow-up for the observed sparse hardware mantissa differences.
The quality script uses device Chrome and records full 1024/2048 faces and
native-pixel 8192/16384 patches, rather than claiming huge full-image downloads.
HDR preview checks include a picked crop at actual 16K-face export coordinates.
Read the PNGs in the corresponding Docs/Research output folders.


## Package fixes, ZIP64, core clouds and reported HDR-5 jets

Build and serve dist on port 4189, then run:

```powershell
node Docs/Instructions/verify-package-fixes.mjs
node Docs/Instructions/verify-small-black-hole-plumes.mjs
$env:ZIP64_LARGE_TEST='1'
npx vitest run src/export/zip64.large.test.ts
Remove-Item Env:ZIP64_LARGE_TEST
```

The opt-in ZIP64 test writes a 4097-MiB entry plus a later entry beyond the 4-GiB offset boundary, verifies all CRCs with Python zipfile, then removes the exact test archive. It needs Python and over 4 GiB free disk space; routine `npm test` skips this expensive case. ZIP64 unit tests also check 64-bit metadata, Unicode, empty entries, CRCs and independent readers.

The package browser test checks independent core-cloud settings without changing the original glow; the supplied black-hole geometry/noise/palette at parent HDR power 5; contrast against the old exponent behavior; output into a browser directory handle; success feedback and local author credits. For automation its destination is an OPFS-backed directory handle, so it checks the selected-directory writing path but does not claim to operate the native OS permission picker. Inspect the PNGs under `Docs/Research/2026-10-25-package-fixes/`.


## Local smoke clouds, radial sources and scene history

Build/serve dist, then run `node Docs/Instructions/verify-local-nebula.mjs`. Inspect PNGs under Docs/Research/2026-10-25-nebula-clouds. The script exercises masks/styles, light/shadow controls, independent regular/radial stacks, resizable central emitters, hide/undo/redo, keyboard shortcuts, layer drag/drop, viewport dragging, deletion, asset replacement/removal undo, native 8K/16K tiles, PNG export, bands, volumes, native jets and CPU PCG smoke. High-resolution checks are native-pixel patches rather than complete giant downloads. `?preset=smoke-clouds` opens the new layered smoke example.


## Viewport and export memory

Run `node Docs/Instructions/verify-viewport-ui.mjs` and `node Docs/Instructions/verify-export-allocations.mjs` against built dist. The first includes a deliberate allocation error and successful retry; the second checks actual GPU allocations for a native 16K patch with three volumes. Inspect the resulting PNGs under Docs/Research/2026-10-25-viewport-ui.
