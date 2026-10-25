# Element detail and output resolution

Output dimensions alone do not establish source detail. Native procedural surfaces evaluate their function at output fragments, while a raster sprite contains only its source pixels. Streaming tiles bound the working image size; a 256-pixel tile is a window onto the selected export grid, not a 256-pixel image enlarged across the sky.

| Element/path | Detail behavior |
| --- | --- |
| Global nebula, band and core clouds | Direct seeded shader in image export; preview cubemaps are editor caches and do not cap exported density detail. |
| Local clouds, native black-hole jet stacks | Direct procedural plane shaders in preview/export; no sprite image bake. |
| Volumetric nebulae | Direct tile shader, with user-controlled ray steps/octaves; increasing output dimensions does not automatically increase the chosen physical ray integration accuracy. |
| Built-in suns and planets | Native shader surfaces, corona, atmosphere and rings; limbs use output derivatives. No 512/768/1024 canvas intermediate. |
| Procedural point/halo/Hubble/JWST/smudge/dust primitives | Analytic live sprite/billboard shading, including native galaxy core glow and particle clumps. Canvas workbench thumbnails remain separate. |
| Procedural miniature spiral/elliptical/edge-on/globular galaxies | Native profile/noise shaders, including dust lanes and seeded grain; no live-layer canvas bake. Profiles differ from the old particle-painted thumbnails. |
| Native galaxy stars | Geometry and analytic point sprites. Star count is authored content, not an image resolution; gl_PointSize remains constrained by the GPU point-size range. |
| Black-hole disc and photon ring | Analytic/geodesic shader; small trajectory/deflection LUTs affect numerical accuracy rather than providing a low-resolution image of the object. |
| Black-hole bent background | Captured cubemap. Auto keeps approximately 64 MiB total and up to 1K faces. Explicit capture size or Match export resolution removes that automatic quality ceiling, subject to hardware and available memory. HDR crop and final export share the selection. |
| Smoke image masks | Bundled finite-resolution particle silhouettes shape larger clouds; seeded internal density is procedural. Select Procedural only to remove the image-mask dependency. |
| Uploaded/file sprites and saved PCG bakes | Raster assets retain their source detail. Upscaling cannot recover missing information. Large sources may exceed the device texture size and be resampled by three.js. |
| Star/billboard placement masks | 512-face CPU rejection masks control placement decisions; they do not contain the rendered star shapes or flatten the composite. |

The 256-square permutation texture, 256-entry gradients and color ramps are lookup tables for seeded mathematical functions. Their dimensions are not the resolution of the nebula or body surface.

Native bodies and procedural flare primitives preserve placement and authored controls, but their GPU recipes are not byte-identical to the old 8-bit CPU canvases. PCG workbench bakers retain their original outputs and remain explicit raster authoring tools. New body noise derives seed offset 0xb0d1; miniature galaxy grain derives offset 0x6a1a from the existing fixed style seeds. Neither consumes or alters existing placement streams.

Full-detail lens captures use approximately `6 * 8 * faceSize^2` bytes per black hole before driver overhead: 2K is 192 MiB, 4K is 768 MiB, 8K is 3 GiB, 16K is 12 GiB. Tiles do not bound those optional captures. Oversized hardware requests fail explicitly; do not silently substitute the auto detail when the user requests a larger capture. A hidden central object needs no captured background and uses an unallocated 1-pixel placeholder.

There is no claim of unlimited hardware resolution or new information in an imported image. Use native layers for large hero elements and check their native export crops. Export formats currently offer 512 through 16384 pixels per face.
