# GNARLY Web — Instant Creative Buttons + Automatic Compact Karaoke

## Verified upstream references

- [KaraokeBird](https://github.com/joshshiman/karaokebird), MIT, uses WinSDK to read system transport state and the Python `syncedlyrics` aggregator to retrieve timed LRC, with a high-frequency PyQt overlay. We borrow its metadata-to-timed-LRC lookup and current-track/next-track cache pattern, NOT its Windows-specific audio/overlay dependencies.
- [jossieb/lyrics-sync](https://github.com/jossieb/lyrics-sync) is a Flask/Whisper/DTW forced-alignment utility requiring audio *and* reference lyric text, heavy Torch/FFmpeg stack, and has Dutch-specific phonetic normalization. It is unsuitable for synchronous lookup on Cloudflare Pages/mobile Safari. The repository root did not expose a LICENSE file during review; no source/weights/assets have been vendored.
- GNARLY's existing LRCLIB strict artist/title/duration matcher and its fallback remain the primary resolution pipeline. LRC cannot be fabricated simply from raw text. A future optional aligned transcription worker must be independently deployed, licensed and authorized for the audio in question.

## New behavior

1. Tap 🎨 once: immediately cycle a curated palette/material/theme selection and apply to the live renderer. **Does not change the selected Experience**.
2. Tap ⚡ once: immediately cycle curated Experience/motion selection. **Does not change Theme**.
3. Tap Aa once: immediately change the synced karaoke HUD typographic treatment (40 GNARLY creative presets have priority). **Does not alter text, timing, audio or visual themes**.
4. Hold any button for ~470 ms, right click, press ArrowDown, or Shift+Enter: open the complete existing manual selection panel (themes, all experiences or full 80+ font/style library), preserving scoped font preferences and existing filters. Normal keyboard Enter/Space does a short cycle. No permanent extra bars or tabs.
5. Lyrics are sought automatically upon selecting any song. The small karaoke HUD is available even during lookup and shows a truthful `Buscando letra…` status when none is cached, without inventing timed lines.
6. A valid, previously verified synced LRCLIB response is stored in a bounded 12-item / 180k-character local cache for up to 12 hours. Cache hits hydrate synchronously before any new API request: repeat plays can show the timed HUD immediately.
7. While playing, only the **first next queued track** is prefetched in the background if it has trustworthy artist/title. No speculative media download, no user audio upload, no scraping via a new Python service, no unbounded requests. Saves both results and metadata in the existing queue state. Disabled if the browser signals data saver.
8. If LRCLIB returns only unsynchronized lyrics, the compact HUD can show the first line, but never claim the line is timed. If providers are offline, status stays visible; media continues unimpeded. It is **not technically possible** to guarantee immediate accurate LRC for unknown songs without a trusted synced catalog or preprocessed/stem-separated audio.

## Code

- `lib/quick-creative-controls.js`: pointer/touch and keyboard gesture classifier, deterministic value cycling.
- `app.js`: quick bindings, immediate style updates, compact lyric feedback, queue lookahead.
- `lib/lyrics-auto.js`: persistent verified LRC cache and one-at-a-time prefetch, existing provider security and artist/version validation retained.
- `tests/quick-creative-controls.test.mjs`, `tests/automatic-lyrics-cache.test.mjs` and Stage72 mobile UI regressions.
- No iOS source, GPU shader code, WebAudioEngine, Cloudflare Functions, player queue policy, export service or permissions changed.

## Integration with expanded karaoke

The independent native-style full-screen karaoke remains in [PR #25](https://github.com/miscrapha-DELTA-IA/Gnarly-web/pull/25). Reconcile that PR from the latest `main` after this change lands; retain `renderLyricArtwork`, font assets, quick gestures and auto-lyrics cache while integrating `ui/karaoke-stage.js`. Do not blindly overwrite the Web app with PR #25's older `app.js`.
