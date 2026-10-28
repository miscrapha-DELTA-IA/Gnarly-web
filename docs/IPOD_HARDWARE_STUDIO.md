# GNARLY iPod Hardware Studio

Baseline: `main` at `1ee7cfa` (2026-10-28). This branch changes the iPod surface and its appearance editor. It does not include the separate playback/queue PR or change the shared backend.

## Rendering and integration

The original `#ipod-device`, wheel button IDs, screen bindings and HTMLAudioElement remain authoritative. Opening the editor moves that same device into a native dialog and closing returns it to its original position. The small mobile material proof is decorative, has no transport controls, and contains no audio element. Appearance modules never own song, queue, MediaSession, DSP, karaoke or shader state.

`lib/ipod-appearance.js` owns normalized versioned data, the catalog and local persistence. `lib/ipod-materials.js` builds deterministic SVG prints and applies CSS variables. `ui/ipod-hardware-studio.js` owns the lazy editor, focus and local configuration controls. `app.js` has only the lazy entry point, artwork pixel cap and appearance-menu integration. All new rendering rules are scoped to the iPod or its dialog in `ipod-mode.css`.

The shell uses independent geometry, color, print, microtexture, light, glass and detail layers. Fourteen material responses have different grain, sheen and translucency; acrylic exposes a static circuit-board layer. Side-frame finish is independent of the body. Materials and prints can be combined. The wheel retains original native button listeners and readable icons with a minimum 44 CSS-pixel target. Screen artwork uses the existing high-resolution resolver, object containment and a source-pixel/DPR cap so unavailable low-resolution covers are not enlarged.

No Canvas/WebGL runtime, third-party library, backend request, texture upload or continuous reflection animation was added. The existing app shader is unchanged. The three lazy JavaScript modules total about 44.2 KiB uncompressed. SVG generation uses a 32-entry LRU, vectors below 40 KB, and reusable pattern cells. Scale, rotation and position reuse the same vector; only changed style values are assigned. Updates are coalesced into one requestAnimationFrame, and local writes are debounced. The static lighting overlay has selective compositor promotion (`will-change: opacity`), so color repaints can reuse it. This is one bounded surface per visible device, rather than promotion of every material layer. Reduced-motion disables tactile transitions.

## Catalog and editor

- **14 materials:** brushed and polished aluminum, chrome, anodized aluminum, glossy ABS, soft-touch polymer, translucent and frosted acrylic, carbon fiber, ceramic, rubber, pearl, holographic and leather-inspired finish.
- **29 prints:** seven camouflage, seven streetwear, eight graphic and seven atelier prints, plus an unprinted option. Camouflage uses overlapping lobed or angular paths with wrapped boundaries, rather than noise.
- **22 complete designs:** Classic Silver, Obsidian, Acid Laboratory, Cyber Chrome, Woodland Tactical, Desert Sand, Digital Field, Tiger Stripe, Midnight Carbon, Candy Pink, Holographic Dream, Retro Cream, Transparent Ice, Violet Smoke, Industrial Titanium, Racing Red, Neon Toxic, Street Edition, Checkerboard Club, Pearl & Petal, Cobalt Alloy and Mineral Archive.

The essential/advanced editor provides solid/two-/three-color bases, HEX/palette inputs, gradient direction, material reflection/texture/metal tint, three print inks, scale, rotation, density, position, contrast, deterministic seed and seven independent component colors. Low-contrast wheel/center labels fall back to black or white. Preset names and status feedback are inline; no new toast balloons were introduced.

## Persistence and compatibility

Autosaved appearance uses `gnarly.ipod.appearance.v1`; user designs use `gnarly.ipod.presets.v1`, with 16 slots and bounded names/records. Save, rename, delete, reset, import and export are local. Reset preserves user designs and the existing legacy image. JSON imports require the expected kind/version, an object, a 32 KB limit, enumerated settings, finite clamped numbers and six-digit HEX colors. Arbitrary CSS/URLs/HTML never enter rendering. Storage failures leave the current design usable and show inline feedback. Merely reading a future-version saved appearance does not overwrite it.

Previously saved IndexedDB skins remain readable as a local decorative body layer. Their old cutouts cannot be pixel-exact under the new geometry; wheel icons remain visible and operable. “Usar carcaça anterior” restores that layer. The existing optional legacy reset can remove it. There is no image-upload input or Canva import UI; JSON is the only new import. No account, duplicate image store or external service is required.

The dialog supports Escape, keyboard tabs, focus restoration and a fallback with backdrop, background isolation and focus trapping. Mobile controls respect safe areas, use 16px text fields to avoid iOS autozoom, wrap tabs and keep a sticky material proof while scrolling. Source artwork remains capped at its real pixel density.

## Reproducible validation

```sh
npm test
npm run build
# Requires Playwright and an AAC-capable system Chromium + ffmpeg.
CHROMIUM_PATH=/usr/bin/chromium node tests/ipod-hardware.browser.mjs
# Optional isolated comparison of light-overlay repaint cost:
CHROMIUM_PATH=/usr/bin/chromium node tests/ipod-paint-probe.mjs
npx wrangler deploy --dry-run
```

The browser suite serves the actual app, appends test-only observation hooks, and plays original synthetic AAC from a local Blob. Provider/metadata calls are stubbed, service workers are blocked and the existing shader is frozen only in the test hook for deterministic software-GPU screenshots. These fixtures do not modify the production audio engine or shader.

Recorded local results:

- **299/299 unit tests pass**, including nine appearance tests; no existing tests removed or weakened. The old Stage72 iPod upload assertions now verify the native editor and seed legacy storage directly, matching the intentional removal of image import.
- Pages build passes; offline shell includes **76 static resources**, including the lazy appearance modules.
- Worker dry-run passes with existing R2, Assets and KaraokeRoom bindings. It uploads/deploys nothing.
- Native Chromium acceptance covers every design/material/print, XML parsing of all generated SVGs, gradients/colors/scale/rotation/seed, preset CRUD, JSON download/import, reload/reset, valid legacy image restoration, keyboard focus, reduced motion, fallback dialog and other surface-mode visibility.
- During customization the original audio source and loadstart count remain unchanged, currentTime advances and playback stays active. Original wheel Next/Previous/center/Play controls work inside the editor; the functional device and audio element remain unique.
- Responsive checks pass at 320×568, 390×844, 768×1024 and 1024×768; additional desktop 1440×1080 and DPR 3 mobile captures. Device width/height stays 0.61; wheel hit targets stay at least 44px.
- Representative desktop silver/camouflage/acrylic/carbon/pearl and mobile captures are produced with the machine-readable `validation.json`. The CI workflow uploads these as `ipod-hardware-visual-acceptance`.

The Stage72 workflow now installs the existing project dependencies before unit tests, so the CSS parser check can run there as well. The iPod acceptance and integrity workflows passed on `742b70f`. The separate broad Stage72 browser suite has an existing search-heading assertion mismatch (“Para você” versus “RESULTADOS DA BUSCA”), outside this iPod scope; it has not been weakened. Actual Safari/iPhone, physical headphones, PWA installation and hardware-GPU frame-rate acceptance remain manual device checks. CSS parsing for Safari 16 and a Chromium dialog-fallback test are not equivalent to running WebKit.

## Performance measurements and limits

Model + SVG generation for the 22 presets measured **p50 0.03 ms / p95 0.56 ms** on this development runner (`npm test` diagnostic). This measures synchronous computation, not browser paint or audio startup.

The full-app headless software renderer is slow. The raw final results are in [IPOD_HARDWARE_VALIDATION.json](IPOD_HARDWARE_VALIDATION.json). The raw browser report separately records store-update-to-next-rAF and automation-click-to-two-frames timings; these include scheduling/paint overhead and are not TTFAP. Before caching the light overlay, the full-app local run measured **1105 / 1269 ms p50/p95** to scheduled paint and **2654 / 3603 ms** for automation plus two frames. After the change, the final full acceptance run measured **775 / 914 ms** and **1314 / 2152 ms** respectively. These are two runs on a software renderer, with scheduling variability; they support the optimization direction and do not establish real-device frame rate. An earlier full CI acceptance also passed, at 693 / 923 ms and 1602 / 1951 ms on a different runner. An isolated shell probe identified static inset-lighting repaint overhead. In 20 samples per variant, promoting only that light overlay reduced update-to-next-rAF p50/p95 from **674 / 727 ms to 212 / 273 ms**, on the same software renderer. The [isolated probe report](IPOD_HARDWARE_LIGHTING_PROBE.json) is a directional engineering probe, not a production benchmark. Disabling identity filters, default transforms and blend modes alone did not establish a material improvement. These results do **not** establish a 60/120 FPS claim or mobile smoothness. Real-device GPU profiling is required before claiming that target.

Audio continuity during the native playback fixture is verified; no provider/network playback-latency improvements are claimed by this visual-only branch. The work does not deploy production, merge the branch, or change backend configuration/credentials.
