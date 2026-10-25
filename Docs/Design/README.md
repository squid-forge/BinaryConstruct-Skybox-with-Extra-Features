# Design reference

See [element resolution and source detail](ELEMENT-RESOLUTION.md) for native shader paths, raster assets and lens quality controls.

## Product and runtime

BinaryConstruct Skybox + Extra Features is a client-side layered sky editor. React owns editor state; TypeScript layer types and IO tables define persisted scenes. Seeded RNG and Perlin streams preserve procedural inputs. PreviewScene builds three.js layer groups and owns WebGL rendering, lens preparation and tiled export sources. Positional layers use sky direction and apparent size; layer order and blend factors control composition.

## Authoring model

Noise layers own nebula parameters, optional band/core masks, color ramps and HDR shaping. Stacking band/core clouds creates independent noise layers. Black-hole layers own a central lens/disc and native jet stacks; each stack has its own seed, geometry, density, palette and HDR exponent. Native jet fragments share procedural noise with nebula rendering and filter detail by screen footprint rather than fixed sprite resolution. PCG baked sprites remain a separate authoring path.

## Serialization and resources

`src/core/io.ts` field tables validate and serialize scene data; the schema is generated from these tables. New fields require roundtrip tests and schema regeneration. Project bundles embed uploaded images; scene JSON preserves image assignments without embedding binary assets. Missing assets are reported and can be relinked.

## Export lifecycle

Tile sources pause the preview render loop, own capture resolution and release GPU resources on completion/cancellation. Row encoders stream through bounded buffers to OPFS or a user-selected directory. Image archives use ZIP64. HDR/EXR softness is applied in panorama space; the crop preview samples the selected export grid, while exposure and tone mapping affect viewing only.

See [galactic clouds, plumes and HDR](GALACTIC-NEBULA-JETS-HDR.md), [memory-bounded export](MEMORY-BOUNDED-EXPORT.md), the [usage guide](../Instructions/USAGE.md), and [verification](../Instructions/VERIFICATION.md). All generation must remain seeded; legacy seed sequences must stay unchanged.

See [localized smoke and lights](NEBULA-SMOKE-LIGHTING.md) and [scene history](SCENE-HISTORY.md) for the shared smoke pipeline, radial stacks, drag ordering and asset-aware undo model.
