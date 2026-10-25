# Exports, HDR smoothness and large files

## 8K and 16K skyboxes

This version adds 8K and 16K export settings for larger skyboxes. Choose PNG cube faces or a PNG, HDR or EXR panorama. The maintainer has tested and used 16K HDR export in Unreal Engine; other features and formats have had limited practical testing.

The resolution menu sets the size of each cube face. Panoramas are twice as wide:

| Export setting | Each cube face | Panorama |
| --- | --- | --- |
| 8K | 8192 x 8192 | 16384 x 8192 |
| 16K | 16384 x 16384 | 32768 x 16384 |

For large exports, use **Save directly to folder** when available. ZIP64 archives allow files over 4 GB. Your GPU, browser and available disk space still limit what can be exported.

## Export controls

Click Export to open its sidebar page. Scroll through the options; export and cancel stay at the bottom. Use Back to editor or Escape to return when no export is running. HDR preview is available for every format.

## Formats and dimensions

Cube faces export as PNG. Panoramas export as PNG, Radiance HDR or OpenEXR. HDR and EXR preserve the scene's lighting values; preview exposure and display settings do not change the exported data.

Per-layer archives contain isolated layers, a composite and composition/star-data metadata. Native lens distortion depends on the complete background and is represented in the composite rather than as an isolated lens image. Variation batches use derived seeds and include a manifest.

## Beyond 4 GiB

The default memory-saving export streams encoded rows to disk and writes **ZIP64** archives. ZIP64 uses 64-bit entry sizes, archive offsets and counts, removing the ZIP32 4-GiB format barrier. Use a ZIP64-capable extractor. Streaming archives use STORE entries (no extra ZIP compression); PNG data is already encoded.

For large jobs, select **Save directly to folder** and click Export. Desktop Chrome/Edge on localhost or HTTPS can ask you to select a directory and grant write access. Each export creates its own `skybox-...` subfolder; a success notice gives that name. Files are written there without a second download. Cancellation removes incomplete files from that job and keeps completed outputs.

With direct-folder mode off, output is staged in the browser's origin-private storage before downloading. That storage has a separate quota and can fill even when your drive has free space. ZIP64 does not remove storage quota. Direct-folder output bypasses that temporary staging quota, but still requires free disk space, filesystem support for large files and browser permissions. A FAT32 destination still cannot hold a file larger than 4 GiB.

All image exports now use the streaming path at every resolution, format, batch and per-layer mode. Memory-saving export stays checked and cannot be disabled. Ordinary project-save ZIP bundles still use ZIP32; the old in-memory renderer is retained only as a library/reference path for tests. ZIP64 is implemented for image exports, not all ZIP-producing operations.

## Preview HDR smoothness

Use **HDR preview** above the tabs at any time. The Export panel also offers Preview HDR smoothness when HDR/EXR is selected. Pick a point in the sky. The preview compares an unsoftened crop with the filtered result sampled at the selected export resolution, so 16K detail can be checked without exporting a complete 16K panorama.

Use EV exposure, display mapping and pixel zoom to inspect bright edges and fine noise. These viewing controls do not change exported radiance. Softness changes HDR/EXR export filtering; zero keeps the unfiltered data. More softness filters a wider native-pixel neighborhood as resolution increases. A crop previews only the selected region; inspect several areas of a complex sky before a lengthy export. Close/cancel the preview before starting an export.

## Failures and cancellation

Cancel export stops further encoding and restores the live viewport. Browser storage quota errors suggest direct-folder export; access errors require selecting an accessible destination. If the folder picker is cancelled, no export is started. Completed files from a cancelled multi-file job can remain in its own subfolder; incomplete files are removed where cleanup succeeds.

A 16K export can take substantial time. Tiled sampling bounds CPU image memory, but shaders, driver allocations, lens captures and disk still consume resources. Device/driver floating-point behavior can change a few final HDR bits even with seeded inputs. See the dated verification results and GPU precision follow-up for measured limits. Full 16K exports are not guaranteed on every device.


## Memory behavior

Built-in suns, planets and procedural flare/miniature-galaxy primitives now shade output pixels directly, alongside nebulae and jets. They no longer enlarge a fixed 256-1024px body/primitive bake. File textures, image-mask outlines and saved PCG sprites still depend on their source detail; see [element resolution](../Design/ELEMENT-RESOLUTION.md).

With visible black holes, **Lens background detail** selects the bent-background capture independently of image dimensions. The default Memory budget uses the limits below. Choose an explicit size or **Match export resolution** to override the automatic capture ceiling. HDR crop previews use the same selection. This can allocate substantial GPU memory: 4K needs roughly 768 MiB per lens, 8K 3 GiB and 16K 12 GiB before overhead. A native 16K body/nebula tile does not require those allocations; the optional background captures do. A request beyond the hardware cube-texture limit fails explicitly. Capture detail is an export-session setting, not stored in scene JSON.

The tile cache is 32 MiB for smaller targets, 96 MiB at 8K faces and 192 MiB at 16K faces; this retains a useful panorama scanline working set without the previous blanket 256 MiB cache. Preview crops use 16 MiB. Volumetric export evaluates density directly on tiles, removing the previous extra 2K cubemap per volume (roughly 192 MiB before driver overhead). Automatic native lens captures target a shared 64 MiB texture budget with at most 1024 pixels per face; explicit capture selections override that budget. Preview drawing also caps device pixel ratio/backbuffer area. These budgets do not cap uploaded textures, all scene geometry, filtering rows, browser internals or total driver memory. They reduce confirmed allocation pressure; they do not guarantee every 16K scene fits every GPU/browser.
