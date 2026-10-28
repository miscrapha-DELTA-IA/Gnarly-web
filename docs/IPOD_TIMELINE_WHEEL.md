# iPod timeline and click wheel

Baseline: `main` at `3218519` (2026-10-28), including automatic bass/reverb activation and the latest full-bleed artwork changes. No backend, streaming, queue, DSP or material architecture changes.

## Interaction

The glass display now contains a styled native `input[type=range]`: tap, drag, focus and keyboard navigation work independently of the wheel. It uses actual finite `audio.duration` and native `audio.seekable` ranges, not catalog length. Missing/indefinite duration or an empty seekable window disables navigation with accessible feedback. Targets clamp to available ranges, including gaps. The duration button toggles total/remaining time without affecting playback.

Hold G for 450 ms (or hold Space while G is focused) to enter navigation. Release, then rotate clockwise/anticlockwise. A two-degree deadband rejects jitter; `atan2(sin(delta),cos(delta))` handles the angular seam. Slow rotation maps one revolution to 60 seconds; measured angular speed increases this by at most 2×. Center crossings and jumps over 90 degrees are rejected. Visual feedback shows the active ring, direction, cumulative displacement, time and progress. The original hardware appearance is preserved.

G confirms; MENU/Escape exits. These exits keep the already selected position, since wheel movement seeks continuously. An interrupted pointer discards pending movement, retaining the last applied native position. Idle exit occurs after eight seconds; track/surface changes, hidden documents and teardown cancel pending work. A long press, including on an unavailable stream, consumes its compatibility click and never toggles play/pause. Normal short presses and original Next/Previous/MENU controls resume outside navigation. Normal-mode wheel gestures retain page scrolling. Trackpad click-and-drag uses the same pointer path as a mouse; two-finger page scrolling is not intercepted.

## Architecture and synchronization

`lib/ipod-seek.js` contains seek-range validation, nearest-range clamping, time formatting and pure circular math. `ui/ipod-transport.js` enhances the existing DOM. It owns no audio source, queue, AudioContext or playback lifecycle. Pointer capture, cancellation, bounded timers and native range semantics provide gesture isolation. No new dependencies or continuous animation loops were added.

Immediate visual preview is isolated from concurrent native `timeupdate`. Actual seeks are coalesced at 120 ms intervals, with a final flush on release/confirmation. The test burst of 60 moves produces **two actual currentTime writes**. Track changes clear delayed writes before source selection. `externalSeek` remains the common native/MediaSession path and now immediately updates progress and LRC; expanded karaoke reads that same native clock. Existing seeked handling retains stems synchronization and final remote karaoke updates. Playback, playbackRate and effects are unchanged by navigation.

## Text cleanup

Hardware Studio labels and descriptions are shorter: “Meus estilos”, “Restaurar”, “Renomear” and concise material/pattern copy. Music uses “Velocidade e tom” and “Mixagem”. Compatibility guidance and separation-engine details remain available in native disclosures; consent, quota and AI limitations remain accessible. The karaoke explanation is under “Sobre as letras”; AI upload consent stays visible and unchanged. Functionality and data attributes remain intact. The old Hardware Studio browser DPR assertion was updated to the full-bleed contract already established by main commits `cfbf5c7`/`284d856`: it now verifies loaded artwork covers the glass in both dimensions at DPR 3, with correct alignment. The two old music-label assertions were updated to their intentionally changed labels, without removing their controls/preset/layout checks.

## Verification

```sh
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium node tests/ipod-wheel.browser.mjs
CHROMIUM_PATH=/usr/bin/chromium node tests/ipod-hardware.browser.mjs
npx wrangler deploy --dry-run
```

The native AAC browser suite uses original synthetic local audio and stubbed metadata/provider endpoints. It freezes the existing shader only in test hooks for software-renderer captures. It verifies short/long G presses, both rotation directions, angular seam and fine movement, bounded rapid seeks, confirmation, MENU/Escape, eight-second idle exit, pointer cancellation, pending seek cancellation on track change, surface exit, slider tap/drag/keyboard, duration toggle, immediate LRC/expanded karaoke, paused/playing audio, offline Blob playback, original Next/Previous, real CDP touch pointers, unavailable/restricted streams, focus and a single audio element. The fixture checks audio loadstart count remains unchanged during navigation. Desktop and phone screenshots plus `validation.json` are uploaded by the iPod CI workflow.

Native range keyboard semantics and touch Pointer Events were exercised in Chromium. Actual iOS Safari/VoiceOver, physical Android, physical trackpad and Bluetooth tests remain device acceptance work; emulation does not certify those platforms. No claims of 60 FPS or provider/network startup improvements are made. Seek accuracy and completion time remain bounded by the media format, keyframes, byte-range availability and provider restrictions.

The separate broad Stage72 workflow has a pre-existing search-heading mismatch (`Para você` versus `RESULTADOS DA BUSCA`). Its assertion is preserved. This delivery is committed/pushed for review; production deployment is not claimed.
