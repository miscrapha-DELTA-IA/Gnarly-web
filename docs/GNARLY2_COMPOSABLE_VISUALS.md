# GNARLY Web — Composable Visual Architecture / GNARLY 2

## Root cause and guiding rule
Legacy `resolveVisual(theme,experience)` selected one exclusive WebGL2 shader family — classic procedural, CreativeUniverse, or physical texture. A material-theme or special GNARLY theme preempted the selected experience even though it remained saved. The lightning tap list also contained 10 manual IDs while the catalog had **24** unique experiences.

Do not touch existing GLSL shader math, authored five-stop material textures, iOS colors, karaoke visuals, player/audio, queue, or browser fullscreen. Preserve legacy combinations *pixel-identical by default* when no independent material and no optional GNARLY accent is selected.

## Implemented

- **🎨 Themes & new colors:** all 17 original Swift `MarbleTheme` 3-stop palettes unchanged; all 6 existing material-theme recipes unchanged; all original GNARLY variants unchanged. The seven **exact** five-stop `VisualMaterialCatalog.curatedPalettes` combinations are also exposed as portable 3-stop color themes via their representative authored stops, and the previously hidden six `CreativeUniverse` palettes 7–12 are selectable independently. Total named theme choices: **41** (17 classic + 6 material + 5 GNARLY including GNARLY 2 + 7 native five-stop palettes + 6 creative color families). Five-stop arrays remain preserved as authored.
- **⚡ Experience:** immediate tap cycles all **24 distinct** catalogued experiences (18 classic including Original, 6 GNARLY) with no manual 10-entry subset. Hold, right-click or Shift+Enter keeps the complete detailed list.
- **Material independent:** the theme sheet offers a *separate opt-in material layer*. Legacy material-theme swatches are still available as complete authored look presets. Enabling the independent layer keeps the theme's selected color uniforms, uses the material family's original GPU geometry, and adds the selected experience in a 0.16–0.34 alpha-composited second pass. Choosing `Nenhum` reverts to the single-pass original.
- **Special GNARLY:** GNARLY original continues its own familiar album-aware procedural colors with **no default tint**. Selecting a color *while* a GNARLY universe is active gives a subtle 16% intentional palette accent rather than silently replacing the mode. Legacy STRATA/COMPILER/ORGANISM retain their authored primary look but gain the optional experience second pass.
- **GNARLY 2:** a fifth GNARLY mode. A deterministic five-stage director selects authored materials, dynamic palettes, and experiences based on song time, duration and album hue. The first section starts near the album cover's hue; subsequent sections develop distinct material/color/experience pairings. Crossfades use smoothstep in the final fifth of each musical segment. When no duration exists, it uses a deterministic 27s fallback. Configurable **Fixar paleta**, **Fixar material**, **Fixar experiência**, plus a material reference selector allow independent manual influence and intentional locks.
- **Real GPU compositing with bounded cost:** the GPU still compiles exactly **three original GLSL programs** at initialization; no runtime JIT, framebuffers, upload-heavy effect chain, new textures or allocations. When an independent material or special GNARLY visual would otherwise hide an experience, render one authored base and **at most one more authored shader** with constant alpha. GNARLY 2 uses that same second pass either for the experience or for a crossfade, not both. Second pass is skipped on reduced motion or sustained quality degradation (renderScale below 0.67); existing adaptive render scale, 60fps pacing, same canvas and CPU fallback remain intact.
- **Persistence** continues on the `gnarly.web.*` keys. New settings: `materialLayer`, `gnarly2LockColors`, `gnarly2LockMaterial`, `gnarly2LockExperience`, `gnarly2Material`, and `gnarlyAccentEnabled`.

## QA and caveats

Unit tests assert exact classic palette identities, all 41 selectable color themes, all 24 unique experiences, 24 × all theme/colour combinations' identity, GNARLY source compatibility, compositing fallback, reproducible phase frames, independent material, and absence of extra GPU program compilation.

Stage72 Playwright mobile UI scenario verifies GNARLY 2, independent material, palette/experience interactions, settings persistence, and preservation of one authoritative HTML audio player, alongside all existing playback, karaoke, queue and visual UI tests.

**Not** a guarantee of 41 × 24 unique GLSL algorithms: materials and experiences retain their authored shader programs and uniforms. The feature combines outputs/parameters and adds procedurally timed author-approved transitions while preserving visual fidelity. Appearance on physical iPhones must still be inspected: mobile WebGL performance, reduced-motion preference and native Metal do not guarantee pixel parity.

Reference iOS files:
- `NightcoreLab/Sources/TurbulentMarbleView.swift` (17 exact `MarbleTheme` palettes)
- `NightcoreLab/Sources/Creative/VisualMaterial/VisualMaterialCatalog.swift` (seven 5-stop palettes)
- `NightcoreLab/Sources/Creative/CreativePresetCatalog.swift` (semantic roles)
- Web original `lib/visual-selection.js` (CreativeUniverse palette catalogue).
