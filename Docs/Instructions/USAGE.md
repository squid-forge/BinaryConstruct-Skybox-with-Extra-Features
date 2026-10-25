# Using BinaryConstruct Skybox + Extra Features

For **8K and 16K skyboxes**, open Export and choose the resolution and format. HDR output can be used in Unreal Engine. The [export guide](EXPORTS.md) explains image sizes, direct-folder saving and large-file limits. The maintainer's practical testing was limited to 16K HDR export in Unreal Engine.

## Start and save

Run `npm ci`, then `npm run dev` from the package directory and open the localhost URL. For the built application use `npm run build` followed by `npm run preview`. The app runs in the browser; local help is available from the question-mark button and Credits opens author and license information.

Choose a bundled preset as a starting point. **Open** imports scene JSON, legacy Spacescape XML and project ZIPs. **Save** writes a project ZIP with scene settings and uploaded sprite images. Keep saved checkpoints. Undo/Redo restores recent scene edits and asset changes during this session. JSON/XML alone does not include uploaded images; missing assignments are preserved and can be restored through Sprites.

## Layers and placement

Use the Layers tab to add, select, reorder, hide, duplicate or delete layers. Each layer has a seed and its own blend settings. Additive blending works best with artwork on black; alpha blending uses transparency. Layers above a black hole can cover its effect; the lens captures the background behind it.

Drag a positional object in the sky to move it, or edit longitude and latitude. Lock position to prevent accidental moves. Sprite apparent size, aspect and rotation control its footprint. Stars and flares have seeded placement and mask controls. Noise layers offer FBM/ridged noise, octaves, scale, gain, lacunarity, warp, color ramps and HDR shaping; volumetric layers add depth and absorption.

## Galactic band and center clouds

Select a nebula/noise layer and enable its galactic band. Adjust band angle, width, offset, intensity, edge power and turbulence. The center has independent longitude/latitude, size, horizontal/vertical stretch, rotation, falloff, halo, glow and tone.

**Stack another nebula** creates a separately selectable cloud with its own seed and settings. **Add core nebula** creates a separate layer centered on the selected band's core, with its own noise, palette, HDR brightness and elliptical footprint. Its **Core nebula only** mode uses the core/halo mask instead of the full band. Creating it leaves the original center glow unchanged. Edit the new layer's core coordinates and shape independently after creation.

## Built-in black-hole jets

Use **+b.hole** in Layers for the native black hole, rather than the PCG workbench. Newly added black holes include jets. Select the layer and enable **Show jets**; **Show central object** can be disabled to leave just the plumes.

Choose **Base jets** or another **Jet stack**, then enable **Show this jet stack**. **Stack another nebula jet** adds independent settings and seed. Plume size scales the chosen stack. Native length, launch gap, width, curve start and launch fade are expressed relative to the horizon size. Change horizon size to resize the central object; use plume size to control the selected jet stack separately.

Length and cone open the plume; launch gap separates it from the hole. Curve amount and curve start bend it after an adjustable initial section. Noise type, scale, octaves, gain, lacunarity, offset, shelf, power, warp, density, contrast, dust and absorption shape the cloud. Inner/outer colors or a multi-stop ramp control color bands across or along the plume. Tip glow/size and knots shape bright details near the ends.

**Plume HDR power** shapes jet emission independently of the central object's HDR power. Very high plume powers, high shelf/dust, zero brightness or hidden stacks can suppress emission. Very long jets can put their ends and tip glows outside the current view. The reported length-200 configuration is retained without moving the endpoints to fit the screen.

## Local smoke clouds, radial layers and lights

Use **+cloud** to add a nebula at the current view center. Drag it in the viewport, or set cloud longitude/latitude. Cloud size, aspect and rotation resize/stretch/orient the whole cloud. Lock cloud position prevents accidental dragging. Existing nebula layers can enable Local resizable cloud; all-sky bands and independent core nebulae remain available separately.

The **Nebula stack** selector switches between independent nebula layers. **Stack this nebula** copies the selected cloud with a new seed and selects the copy. Its masks, light positions, colors, noise, HDR and placement are independent. **Stack radial cloud** makes a smaller concentric copy; use radial cloud radius, inner cavity and radial falloff for nested envelopes or shells. Each radial layer is a separate layer with its own controls and visibility.

Choose Procedural only or one of four bundled Kenney CC0 smoke masks: puff, billow, wisps or burst. Smoke pattern adds billowing smoke, folded filaments, ridge walls or dust cavities. Mask scale, erosion and edge softness shape coverage; the Noise section adds procedural frequency, warp, octaves, power and shelf. The texture supplies the broad silhouette, while procedural details are evaluated at native output pixels for live layers.

Two editable lights illuminate each cloud. **Center main light** places light 1 in the middle. Show embedded light sources displays their emitting cores; Light source size and glow resize those visual cores and halos. Each source has horizontal/vertical/depth position, color and power. Power zero disables a source. Moving a light changes the density-integrated shadows and shaft pattern. Light source size controls the visible emitter, not a physical area-light penumbra simulation.

Use Smoke density, Cloud depth, Background extinction, Self shadow, Light shafts and Ambient emission to balance dark dust and radiant gas. Cloud shadows over background selects an extinction-capable blend; additive clouds can add emission but cannot darken underlying stars. These are artistic density-slab shadows/scattering, rather than full 3D radiative transfer. The lights belong to that layer; unrelated Sun/star layers are not automatically used as light sources.

Use the color ramp's preset picker for HOO/SHO mapped palettes, hydrogen red/pink, oxygen teal, Orion/Carina-inspired colors or oxygen with warm dust. Radiant saturation is independently adjustable. HDR multiplier can brighten emission while preserving float output; preview display clipping is not the same as exported HDR radiance.

Shared smoke controls appear on noise/band/core nebulae, volumes and each native jet stack. PCG nebula/plume bakers and selected PCG object components (jet pairs, shells, corona, discs and halos) also offer smoke controls. PCG masks and shading are baked into the sprite; use native cloud layers for live background extinction and export-resolution procedural detail. The smoke-clouds preset demonstrates separate cool and warm cloud layers.

## Undo, visibility and reordering

Use **Undo** / **Redo**, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y. The last 80 scene transactions are retained in memory; edits to the same field within 600 ms coalesce. Layer creation/deletion, stacking, sliders, viewport dragging, visibility, ordering, scene imports and uploaded sprite additions/removal/replacement can be restored. Editing after undo clears redo. Existing text fields keep their native text undo while focused.

The eye button in each layer row beside the row's lock action toggles visibility without deleting settings. Drag a layer row onto another row to rearrange it; up/down arrows remain available. File order controls compositing: moving a dust cloud in front of stars lets its extinction cover them. Reordering is undoable.

History is session-only and is not saved inside a project. Selection is clamped when restoring deleted stacks. Camera movement, grid/export preferences and temporary PCG workbench parameter edits are outside scene history; a baked sprite and its scene placement are tracked. Asset versions share image bytes across checkpoints, so every slider edit does not duplicate large PNGs in memory.

## PCG and sprites

The PCG tab generates stars, galaxies, nebulae, planets and anomalies including quasars and black holes. Adjust, bake to a sprite, then place and resize it. These baked textures are separate from the native black-hole shader and its live jet stacks. The Sprites tab manages built-in, baked and uploaded assets. Re-upload missing originals with matching assignments when a scene JSON references unavailable images.

## Scene script

The Script tab edits version-2 JSON live. Valid edits update the scene; validation errors identify the problem. Use the bundled `schema/scene.v2.schema.json` (also linked in the tab) to discover fields and legal values. Keep the `version` and `layers` structure. Use new seeds for independent variations; avoid changing existing seeds if you want to preserve existing generated structure. Export JSON for editable settings; save a project ZIP to include custom images.

## Export and HDR preview

Open Export to expand the full sidebar page. Options scroll independently while export/progress/cancel actions stay at the bottom. Back to editor or Escape returns to the previous tab; an active job must finish or be cancelled first. Choose resolution, formats, faces/panorama, variations and optional per-layer output. Preview HDR smoothness is available for every format. For large files keep memory-saving export enabled and choose **Save directly to folder** where supported. See [Exports and HDR](EXPORTS.md) for ZIP64, lens capture detail, folder permissions, smoothness preview, cancellation and limitations.

## Credits

Original editor: **BinaryConstruct**. Spacescape inspiration, algorithms and original assets: **Alex Peterson**. Codex generated this edition's modifications at the owner's request, with no manual coding reported by the owner; it is independent of the original release. See [credits](../../CREDITS.md) and the unchanged [MIT license](../../LICENSE).

The code is MIT-licensed. The bundled HYG v2 catalog is separately CC BY-SA 2.5; smoke masks are CC0. See the local Credits and licensing notices when redistributing data or artwork-based output.

## View modes and FOV

Use **Preview quality** above the view controls if editing feels slow. Low renders at 50% scale, Medium at 75%, and High uses the full preview resolution. Lower settings also shrink nebula, black-hole background and panorama preview buffers. Medium is the default, and your choice is remembered in this browser. This changes only the editor view, not saved scene settings, image exports or HDR preview crops.

Cloud and nebula edits reuse their existing preview buffers and smoke masks. Slider updates are grouped into short batches, and the view stops redrawing while idle. Large star fields and complex PCG bakes can still take time to generate.

Use the projection menu above the tabs to switch between 3D sky view and a letterboxed 2D panorama overview. The 2D view displays the full 360 by 180 sky; clouds remain draggable and sprite drops/HDR area picks use panorama coordinates. New objects in the overview start at longitude/latitude zero. Its preview cube faces use 128, 256 or 512 pixels according to the quality setting; use an HDR crop to inspect export detail.

In 3D, Field of view accepts 15 to 120 degrees and stays synchronized with wheel/pinch zoom. Switching projection preserves the 3D FOV. The always-visible HDR preview button opens native-resolution smoothness comparison without first selecting an export format. Select the export resolution in Export to choose its native crop grid.

Image exports always use bounded-memory streaming. Tile cache budgets scale with face size (32/96/192 MiB) to retain high-resolution scanline working sets, while HDR preview uses 16 MiB. Volumes shade directly in tiles instead of allocating export-resolution cubemaps. Lens captures share a conservative GPU budget and may use lower background-capture resolution in crowded scenes. Uploaded texture sizes, driver memory and disk limits still matter; direct-folder saving avoids browser staging quota rather than GPU memory use.
