# Galactic rim nebulae, jet sprites and HDR softness

## Galactic rim nebula

Choose the `galactic-rim` preset for a complete example. Any nebula layer can enable **Band nebula** under Galactic nebula. This confines the existing procedural noise/ramp to a great-circle band, retaining all noise type, octave, gain, lacunarity, scale, shelf, power, warp, color ramp, dither and HDR controls.

Band thickness is the Gaussian latitude spread in degrees. Tilt uses the same X rotation and local z=0 plane as point-star band generation. The glow center has longitude in the band plane, an offset from the plane, angular extent, strength and color. Glow follows the noise structure and can be moved independently of the band thickness.

From a star layer, **Add aligned band nebula** copies its tilt and enables band placement for those stars. Masks override star-band placement, so this action switches off their mask. The resulting layers are independently editable; later tilt edits must be applied to both. New band fields are optional, so old scenes keep their previous generation. Both JSON and XML persist the controls; the published schema includes them.

## Quasar and black-hole jets

In **PCG > Type: anomaly**, choose quasar or black hole with nebula jets. Show central object can remove the star or black hole and host glow while retaining jets. Show jets controls the plumes independently. Length, width, cone angle, bend, asymmetry and knots control their geometry. A separate Perlin seed stream supplies plume scale, octaves, warp, density, contrast and dust. Inner/outer colors and tip strength/extent control emission. The new black-hole style shares these controls and adds a scaled geodesic disc/ring sprite at the origin.

Bake to Sprites, then Add to skybox. The resulting sprite has placement, size, stretch and rotation controls in Layers. Bakes retain the existing additive sprite behavior; the new black-hole generator is decorative and does not lens the scene. Use the existing positional black-hole layer for lensing.

## HDR/EXR panorama softness

Export exposes HDR softness when HDR or EXR is selected. Default 1 smooths sharp stellar peaks; 0 retains native sharpness. Values up to 4 increase smoothing. Amount is expressed relative to 2048px panorama height and scales with output resolution. This applies to the linear radiance rows before RGBE/half-float encoding, retains highlights above 1 and wraps the longitude seam. PNGs and particle data are unaffected.

`softenPanorama` uses a separable tent filter, normalized weights, sliding sums and a bounded row cache. Work is linear in image pixel count, with no full image allocation. HDR/EXR smoothing uses the memory-saving export path. It approximates smoothing in equirectangular angular coordinates rather than a spherical convolution.

## Large-file limits

Streaming image exports use disk-backed ZIP64 output, including entries and offsets beyond 4 GiB. Direct-folder mode avoids browser temporary-storage staging quota; disk, filesystem and browser limits remain. Project saves and legacy in-memory exports remain ZIP32. See the current export guide.


## Stacked bands and shaped galactic cores

Band brightness, offset, edge shape and turbulence refine the band envelope independently of the noise settings. Core horizontal/vertical stretch, rotation, falloff, halo strength and halo extent shape the center glow independently of the band. Stretch 1/1, rotation 0, falloff 2, halo 0 and band brightness 1 preserve the previous default path.

**Stack another band nebula** creates another editable noise layer with the same alignment, width, core shape and color settings. It derives a new seed, skipping noise seeds already present in the scene. The new layer starts with center glow 0 to avoid adding another bright core automatically. Each layer retains its own colors/ramp, noise, opacity/blending and HDR controls. Enable its center glow if a second core cloud is desired. There is no fixed layer-count cap; preview and export cost increase with layer count.

## Detached and curved nebula plumes

**PCG > anomaly > nebula plumes (no central object)** creates standalone plumes. The existing **black hole** generator now also exposes **Show jets**. Quasar and black-hole-with-jets styles can use the advanced nebula renderer. Existing style defaults retain their previous rendering until advanced geometry/noise controls are edited or the advanced option is enabled. The ordinary black-hole generator remains unchanged when jets and advanced options are absent.

The launch gap is measured from the object center along the initial jet axis. Curve start distance is measured from the launch point: bending starts at `gap + curveStart`. Signed curvature grows smoothly from zero slope after that point, producing opposite S-shaped jets. Body, tips and framing all use the same curve. Even very large terminal glows are excluded from the central launch gap before the optional central object is painted.

Length and gap sliders reach 20; numeric entry accepts larger finite values, with a rendering guard at 1,000,000 units. Cone half-angle reaches 89.5 degrees. The complete geometry auto-fits within a sprite, so increasing length relative to the black hole makes the black hole smaller in that sprite. Resize the resulting sprite under Layers for its apparent sky size. Geometry remains a two-dimensional sprite, not an unbounded sky volume.

Plume nebula controls include FBM/ridged noise, scale, 1-16 octaves, gain, lacunarity, ridge offset, shelf, power, warp strength/scale, density, contrast, dust, absorption, brightness and inner/outer colors. **Plume color bands** exposes the shared editable multi-stop ramp and nebula palette presets. Map the ramp over noise density or along the plume length with **Color bands along length**. Tip strength/extent and jet asymmetry remain independent controls.

The PCG controls described above remain available for sprite authoring. As of E15 (October 25), the built-in positional black-hole layer also has native procedural jet stacks, described below.


## Built-in black-hole jet stacks (E15)

Use **Layers > +b.hole > Nebula jets > Show jets**. No PCG bake or image asset is needed. The layer retains its lens, shadow, photon ring and accretion-disc controls. **Show central object** hides those features while keeping the jets and placement proxy.

**Jet stack** selects Base jets or a named additional component. **Stack another nebula jet** deep-copies the selected plume settings, derives an unused seed, and selects the new component. Every component has its own noise, colors/ramp, geometry, brightness, visibility and size. Additional components can be renamed and removed. The base component has its own optional jetSeed and jetBaseVisible, independent of the black hole's disc seed. Show jets is the master toggle for the whole plume stack.

Native length, width, gap, curve-start distance and launch softness use horizon-radius units on the tangent plane. Plume size multiplies the selected component's dimensions without resizing the black hole's horizon. Growing a jet extends it across the sky instead of shrinking the central object to fit a sprite. All components move with the native placement/drag proxy. Parent HDR power/multiplier apply to all plume emission; per-component brightness remains independent.

Native plumes are evaluated per fragment using the built-in nebula's seeded Perlin/FBM/ridged-noise library and color-ramp machinery. Geometry, delayed curvature, terminal lobes and hotspot emission are analytic. Noise octaves below the output pixel footprint are suppressed, and narrow/steeply curved profiles receive derivative-based filtering. Radiance remains linear and may exceed 1. There is no fixed-resolution color image to magnify. The old jetTextureSize field remains loadable for compatibility but no longer controls native quality. PCG sprite bakes retain their existing raster workflow.

BlackHoleLayer stores the base plume fields and optional jetLayers array. Each array entry contains only plume settings plus name/seed/visibility/size metadata. Scene JSON and XML persist them; XML stores the nested array as escaped JSON. The field table drives nested validation and the published schema. The native renderer owns/disposes each component's geometry, shader, noise lookup textures and color ramp.

Background capture hides the entire native group so it cannot lens or duplicate its own jets; foreground lenses still see lower layers including their jets. The existing lens-background capture cap is separate from the resolution-independent plume shading. Black-hole layers retain the existing flattened-composite export semantics.

Use the **nebula-jets** preset for two independently editable galactic clouds and two native jet components.

## HDR smoothness preview (E16)

Open **Export**, enable HDR or EXR, choose the target resolution and click **Preview HDR smoothness**. The dialog compares a 384 by 192 native-export-pixel crop against the same crop after the export softness filter. It initially uses the current view center. **Pick another preview area** temporarily hides the dialog and lets the user click a star, jet or nebula in the sky.

Preview softness edits the actual export option. Exposure in EV, Reinhard/linear display mapping and 1x/2x/4x pixel zoom affect display only. Radiance peaks are reported before display tone mapping. Zero softness gives identical images. Escape/Cancel releases tile resources and returns to the viewport. Stale crops are hidden while a different region, resolution or scene is being captured.

The capture samples the same native-resolution tile source and panorama projection as export, including wrapped longitude and clamped pole rows. Only the crop plus a halo for maximum softness is retained. The shared tent filter accepts the full panorama's reference height, so a 16K preview uses the same angular blur radius as the full export rather than the crop's height. Unit tests compare this against a full filtered panorama at the longitude seam and pole boundary. No multi-gigabyte download or temporary disk file is needed for preview.

Tile rendering pauses viewport draws, resets shared GL state between draws, and restores renderer ownership/display dithering when the final source closes. Capture size is local to each source, avoiding interference when a preview is cancelled/replaced. UI progress and cancellation remain responsive. Byte-exact repeat export checks use the canonical software renderer; hardware float-rounding portability is tracked separately.


## Independent core clouds and native plume HDR

`bandCoreOnly` selects the elliptical center/halo mask rather than the full band. Add core nebula copies core placement/shape into a separately seeded noise layer, resets its glow to zero and gives it independent noise/palette/HDR settings. The source layer and its center glow remain unchanged. Core-only rendering uses `bandIntensity` as cloud brightness and does not add the band's analytic center glow.

`jetHdrPower` belongs to each plume parameter block and defaults to 1. The central black hole's HDR exponent no longer controls plume density: applying a parent exponent of 5 before dust subtraction could remove nearly all body emission. The parent's HDR multiplier still scales emission; independent plume brightness remains available. Explicit plume HDR powers are serialized for base and stacked jets and exposed in native/PCG controls. Long jets with along-length ramps can show only their dark launch colors in the current view; bright tips stay at their configured endpoints.
