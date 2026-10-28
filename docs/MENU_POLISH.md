# GNARLY menu polish

The new Exibição hint used an SVG without intrinsic dimensions. With an older cached stylesheet, the browser allocated the SVG default of 300 × 150 px. The hint now declares 10 × 10 px in HTML, stays small without its component CSS, and uses a restrained 2px stroke. Its former underline and glow were removed. The eye's size, touch target and gestures are unchanged.

Module and Omnibox chevrons are 16px with intrinsic bounds and clear open/closed states. Exibição reuses the existing SVG sprite, shows which visibility layout and audio group are selected, and keeps native checkboxes with accessible targets. Music/Stems inputs remain native ranges with a 46px interaction area, an 8px track and a 24px thumb. Labels, numeric units, theme colors, type, player layout, audio effects and transport remain intact.

Focused menu buttons now keep native Space activation, including key repeat, instead of invoking the global player shortcut. Arrow/Home/End navigation follows selected tabs; Escape and input/range keyboard behavior remain native. The search field does not steal focus from a keyboard-selected tab. SW shell version `menu-v8` refreshes cached UI assets.

Validation: 334 unit tests and production build; focused browser acceptance at 320, 390 and 1280px; Stage72 desktop/mobile/queue/karaoke/iPod integration; native pause/resume. The focused suite imports an original 30-second WAV through the real file input and verifies finite playback, no source change, no seek, and zero pause events during menu keys. It also checks the SVG without component CSS, selected/focus states and no horizontal overflow.

Run `node tests/menu-polish.browser.mjs` for after screenshots/JSON (default `/tmp/gnarly-menu-polish/after`). A historical before capture is available with `MENU_PHASE=before MENU_BEFORE_REF=c1ea261` in a checkout containing that reference. CI adds the suite to iPod Hardware acceptance and uploads its artifacts. The old Stage72 assertion for “Para você” now checks the actual existing “Resultados da busca” heading; no product search behavior changed for that update.

Physical Safari/iPhone and hardware rendering remain device checks. This patch adds no runtime dependency, provider request or audio processing.
