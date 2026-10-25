# GNARLY WEB ↔ iOS Stage 72: Parity Roadmap

Source reference: `miscrapha-DELTA-IA/NightcoreLab` @ `744b998a0d85c316407d17c9e4d3690b3b1e8dfe` (branch `stage-72-client-onboarding-final`).

**Principle:** Preserve Stage 72 UX. Do not modify the iOS repo. Port contracts and interactions, not UIKit/SwiftUI binary or unlicensed media.

## Package boundaries

- SwiftUI `ContentView.swift` (queue, main screen, omnibox, player controls) → `index.html`, `styles.css`, `app.js`.
- SwiftUI `NowPlayingScreen.swift` (karaoke, creator routes) → web sheets in `app.js`, future separate modules.
- `AudioEngineManager.swift` → initial `lib/audio-engine.js` (one source graph and convolver; advanced DSP not yet at parity).
- `PlayerBackground.swift`, `TurbulentMarbleView.swift`, `VisualMaterialCatalog.swift`, `GnarlyThemeEngine.swift` → `lib/visual-engine.js` Canvas palette approximation, future WebGL2/WebGPU rewrite.
- `LyricsStore.swift` → `lib/lrc.js` LRC parser + temporal lookup.
- `MusicCatalogService.swift` → `netlify/functions/catalog.mjs` Apple catalog metadata and licensed previews only.

## Work packages ordered by capability

1. Visual contracts: normalized 390×844 screenshot diffs; 8+ materials; swap Canvas 2D for WebGL2/WebGPU; keep continuous time-based animation; GPU fallback.
2. Media contracts: audio resume, end-of-track queue, seek, preserve pitch, DSP parity; test iOS Safari playback and interruption.
3. Search and catalog: terms and preview restrictions; permitted streams only; retries/caching/error handling; metadata consistency.
4. Lyric contracts: LRC and translated word-level timing; overlay controls, typography.
5. Music panel: EQ, pads/loops, sections and multimodal sync.
6. Export pipeline: short vertical MP4 composition with sync; WebCodecs feasibility + fallback on iOS Safari.
7. Stems: client WASM or server accelerator with appropriate rights and explicit performance constraints.
8. QA: VoiceOver, safe areas, battery/thermal budget, 60fps target, offline PWA shell, Netlify CI and monitoring.

## Known missing native features

Hardware stems, mic karaoke scoring, MP4 export, Cifra Club chord mode, native haptics, offline persistence of entire imported library, native lockscreen controls on all browsers, theme engine numerical parity, automatic song discovery by full tracks.

## Acceptance criteria before claiming '1:1'

For each feature: matching visual behavior at supported viewport; matching UI affordances; matching audio behavior within browser constraints; explicit degradation path on unsupported browsers; automated tests; manual Safari iPhone verification. Track incomplete features transparently in issues.

## α6 completed (2026-10-25)

- `CreativeVisualTaxonomy.swift` → `lib/visual-selection.js`: classic/material theme families, GNARLY override semantics, separate experience + reaction persisted in browser. Seven classic native live experiences + six Creative Universe experiences and Original recipe. The visual UI no longer silently conflates all three selectors.
- `VisualMaterialCatalog.swift`, `TurbulentMarbleView.swift` → `lib/visual-engine.js`: expanded WebGL2 material geometry and GNARLY 20%-to-28% cover-color transition. This is a shader *port approximation*, not exact Swift/Metal output; mobile screenshots and physical iPhone FPS comparison remain open.
- `StemMixerControls.swift` → `lib/stem-mixer.js`: four actual audio channels, gain 0–200% and sem voz/só voz/ritmo shortcuts. Neural separation and cloud jobs **not available** on web yet. The original remains one HTMLAudio playback clock; the stems are kept in sync with seek, play, pause and playbackRate.
- No changes to the iOS app, original Render extraction, Apple or YouTube authorization logic.

Acceptance gaps remain: Metal shader numerical fidelity, true Demucs cloud/native separation, advanced pitch-shift DSP, Safari/WebKit device smoke, karaoke microphone, pads and MP4 export.
