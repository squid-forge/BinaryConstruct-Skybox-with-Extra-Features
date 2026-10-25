# Memory-saving image export

The exporter supports native output dimensions up to 16384 pixels per cube
face (32768 × 16384 panorama) without allocating full-sized CPU/GPU images.
The application always uses streaming image export. The previous in-memory bake remains a library/reference method for small verification renders.

## Rendering and projection

`PreviewScene.createTileSource` snapshots the requested layers. Flat noise
layers configure the existing seeded noise shaders directly, without baking
per-layer cubemaps. Built-in sun/planet bodies and simple procedural flare primitives use native shaders, without image bakes. Volumetric density is also shaded directly per tile. Automatic lens captures use a shared allocation budget, capped at 1024 pixels per face; an explicit lensResolution overrides that budget (including 'native' to match export size). Explicit captures remain subject to GPU cube limits and available memory. HDR crops pass the same option. See [element detail](ELEMENT-RESOLUTION.md). Noise
detail is evaluated at the selected output resolution, rather than upscaling
a smaller composite.

Each cube camera renders a 256 × 256 tile through a view offset. Point-size
guard bands keep sprites whose centres lie outside a tile from being clipped.
The reusable half-float render/readback scratch buffers include these borders;
cached tiles contain only the core, in top-down RGBA half-float order. Renderer
target state is restored after every tile, before yielding to the preview.

`TileSampler` retains adaptive 32/96/192 MiB of half-float tile payload in an LRU.
Cube PNGs read tiles in scanline order. Panoramas map pixel centres through
the same longitude/latitude and GL cube-face convention as the old GPU pass,
bilinearly sampling four texels and crossing cube edges. Evicted tiles are
re-rendered on demand. No full face, panorama or float image array is retained.

## Encoding and downloads

`streamEncoders` consumes one reusable float scanline and emits small batches:

- PNG: opaque 8-bit RGB, Sub filtering, one streaming zlib stream split across
  IDAT chunks, with standard CRCs.
- Radiance: RGBE scanline RLE, or flat RGBE outside valid RLE widths.
- OpenEXR: standard uncompressed half-float RGBA scanlines with 64-bit offsets.
  EXR is larger on disk than the previous ZIP-compressed format.

`DiskFile` owns bounded copies of encoder buffers (roughly 1 MiB before a flush) and awaits filesystem writes. Streaming image archives use `Zip64Stream`: incremental CRC32, STORE entries, UTF-8 names, data descriptors, ZIP64 central-directory sizes/offsets and end records. Only entry metadata remains in memory. Entry sizes and offsets may exceed 4 GiB; a real 4097-MiB entry and subsequent beyond-boundary entry were independently verified with Python zipfile.

`DiskExportJob` supports OPFS staging or a selected user directory. Direct mode creates a unique subfolder, writes final filenames, retains completed files and removes incomplete job files on cancellation. It never cleans unrelated files in the selected folder. Folder choice starts in the Export button gesture before encoder imports. Direct mode avoids OPFS quota but still depends on browser API support, disk space and filesystem size limits. Project-save bundles and the library/reference in-memory export path remain ZIP32.

Completed OPFS Files are downloaded via object URLs. URLs survive 60 seconds;
job files survive two minutes after downloads start. Failed/cancelled jobs
close their streams and remove their temporary directory. Jobs left by closed
tabs are removed on a future export after 24 hours. Cleanup touches only the
app-owned `skybox-export-temp` OPFS subtree.

## Limits and verification

This bounds working image buffers, not all browser memory. Scene geometry,
sprite textures, preview targets, lens captures, the garbage
collector and browser/GPU drivers use additional memory. Disk space/browser
quota is required. OPFS needs a secure context (localhost qualifies); Chrome
or Edge are the intended local browsers. Cancellation is checked between
small batches; individual GPU draws/readbacks remain synchronous.

Seeded inputs are stable for a fixed scene and mode; GPU output can have sparse last-bit differences on hardware drivers. Controlled SwiftShader repeat exports are byte-identical in the verification suite. Direct noise evaluation
can differ slightly from a pre-baked half-float texture; point rasterization
can also vary at subpixel boundaries. The original generation seeds and
legacy path remain unchanged. Verify visual similarity as well as repeated
mode determinism. Encoder tests load EXR through three.js's independent loader.
See [browser verification](../Instructions/verify-streaming-export.mjs).
