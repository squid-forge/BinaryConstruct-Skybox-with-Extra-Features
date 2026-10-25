# Local nebula smoke and lighting

## Authoring model

Local clouds are an opt-in mode on NoiseLayer (`cloudEnabled`), preserving legacy all-sky defaults. They add sky longitude/latitude, apparent size, aspect and rotation, and use the same placeable quad contract as other draggable objects. +cloud initializes a new radial cloud at the view center with a central emitter. Stacking deep-copies layer data, derives a distinct seed, and selects the new layer. The Nebula stack selector makes control scope explicit. Radial stacks are smaller concentric independent layers, not a merged parameter list.

Radial footprints support an outer radius, inner cavity and radial falloff. Cloud size scales the whole quad; radial radius controls the density footprint within it. Visible light size and glow are separate from cloud scale. Two internal lights own position/depth, power and color; centering the main light resets its local XY position. Light power also affects emitted source radiance. Emitter size currently changes the visible core/halo rather than sampling a physical area light.

## Shared density and scattering

SmokeParams is shared by noise/band/core, volumetric, native jet parameter blocks and PCG nebula/plume bakes. Optional smokeEnabled gates changes to existing layers. Four CC0 texture alpha masks are combined with two oriented stamps and seeded procedural density. Style modes provide billows, folded filaments, ridges and cavities; mask scale, erosion and feather shape coverage. Density/depth/absorption and radial envelopes further shape optical thickness.

GPU all-sky noise and volume smoke use spherical direction coordinates, triplanar mask stamps and direction-space light/shadow sampling. Each projected mask blends four half-tile-overlapping stamps with smooth periodic weights, covering transparent particle borders at internal joins. They have no rectangular longitude-edge fade, including fractional mask scales. Local clouds and jets retain finite planar footprints and their adjustable outer fades. Smoke-disabled rendering and seed streams are unchanged.

The shader uses six density samples along each cloud-to-light segment to estimate Beer-Lambert transmittance. Light depth determines when the segment exits the slab. A scattered-light term emphasizes paths of high transmittance to create adjustable shafts. Saturation and ambient emission remain artist controls. Extinction is output as alpha, with one / one_minus_src_alpha blending to darken layers beneath. Native jets remain additive emitters and do not cast external background extinction.

This is a 2.5D density-slab lighting approximation. Volumetric nebula emission still uses its existing 3D density integration, with the smoke mask and lighting evaluated per ray to avoid repeating expensive shadow work at every depth step. There is no automatic linkage to unrelated Sun/star layers, cross-cloud shadow map, physical elemental chemistry or full multiple scattering.

## Render paths and ownership

NoiseCubemap owns shared seeded Perlin/ramp resources and optional smoke texture lifetime. Local clouds use a direct procedural plane shader, so preview and tiled exports evaluate the same density rather than enlarging a baked image. All-sky/volume previews rebake their cubemaps after asynchronous smoke assets arrive; native jet and tile-source ready promises include smoke loading. Disposed resources cannot install late texture loads. Tiled export waits for layer readiness.

Cloud, all-sky noise and volume edits update existing materials and buffers when their type and buffer size stay compatible. Unchanged smoke masks keep their texture; changing masks replaces it. Native object replacements acquire shader programs before disposing the old materials. Lens captures are grouped before the next frame, and unchanged views do not redraw continuously. Placement-mask readbacks have a two-entry LRU (12 MiB maximum) without changing mask resolution or seeded placement. Export preparation remains synchronous and independent of these preview scheduling changes.

Smoke masks provide finite-resolution silhouettes; procedural density supplies native-pixel interior detail. CPU PCG bakes use cached alpha masks plus a seeded field and six-sample density shadows, with baked light cores. Selected PCG object components apply the field to their own scratch canvas before composition. CPU and GPU paths are artistic counterparts, not byte-identical implementations. PCG sprites retain their bake resolution and cannot dynamically extinguish unrelated sky layers under additive blending.

## Palettes and persistence

Shared palettes include mapped HOO and SHO, hydrogen emission red/pink, oxygen teal, oxygen/warm dust, and Orion/Carina-inspired ramps. Narrowband colors are explicitly labeled mapped. Noise/jet IO fields include independent smoke/light settings; schema generation and JSON/XML roundtrip tests cover local clouds, volumes, base and nested native jet stacks. Existing generation streams are unchanged when smoke is disabled; new CPU smoke streams derive an independent seed offset.

## Assets

Four unmodified PNGs by Kenney Vleugels are bundled under public/masks/smoke with original CC0 license text and source filenames/SHA256 provenance. The reference image supplied by the user is visual guidance, not a bundled asset. Source attribution is in CREDITS.md.
