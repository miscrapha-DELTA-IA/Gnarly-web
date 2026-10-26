# Gnarly Visual Identity Contract — Stage 77

Reference: NightcoreLab iOS build 72/76, CreativeUniverse.metal, Shaders.metal and the user's device screenshots.

## Invariants
- Theme owns the three-stop chromatic palette; an experience must not substitute a different one.
- Experience owns macro-geometry, mid-frequency structures and screen-stable micrograin.
- Audio behavior is surface-specific: lines thicken, fractures breathe, lava edges glow and contour spacing changes by different FFT bands. Off removes audio response but keeps time-driven movement.
- Procedural GNARLY themes override the experience temporarily, without losing its saved identity.
- Independent WebGL2 shader programs are compiled once; the player, playback, backend and Cloudflare APIs are untouched.
- WebGL2 cannot promise Metal pixel equality; compare screenshots on physical hardware before claiming full 1:1.

## Reference textures
- Xerox Serpentine: xerographic toner and distressed printed serpentines.
- Jacquard Signal: crosswoven threads, interlaced mesh.
- Subatomic Bubble: concentric orbital waves.
- Prism Carmine: refractive/engraved rectangular cells.
- Isometric Chasm: topographic iso-lines.
- Crimson with Organic Web / Fractured Cells / Plasma Lava / Topographic Moiré: identical palette, completely different shapes and materials.

## Acceptance
Four independently selected GPU shader families, consistent palette uniforms, four materially distinct pixel signatures and different response to bass/mid/treble/beat on actual WebGL2. Unit and browser CI should run before merging to main and Git-connected Cloudflare Pages.
