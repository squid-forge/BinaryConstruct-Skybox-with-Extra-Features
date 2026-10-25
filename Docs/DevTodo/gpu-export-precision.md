# GPU export precision portability

Observed on Chrome/ANGLE, NVIDIA GTX 1660 SUPER / D3D11: repeated native-layer HDR exports of identical scene settings can differ by sparse single RGBE mantissa steps. One captured run had 59 differing encoded channels with maximum byte difference 1. Native CPU plume bakes were byte-identical, and canonical SwiftShader export runs were byte-identical. The hardware discrepancy was not fully diagnosed; do not label it resolved merely because one instrumented hardware run matches.

Tile rendering now isolates preview frames and resets shared renderer state, disables display dithering during export, and restores state/ownership on cancellation. Those protections do not establish universal hardware byte equality. Future focused work should isolate shader/half-float and driver behavior with captured raw tiles and a minimal reproducible scene. Preserve seeded streams and legacy image compatibility; do not hide the observation by globally reducing color precision.

The native workflow verification script defaults to SwiftShader for its byte-equality assertion. Set HARDWARE_RENDERER=1 to reproduce with the device renderer. Scene JSON, seed streams and stack settings are deterministic; device floating-point output portability remains a separate concern.
