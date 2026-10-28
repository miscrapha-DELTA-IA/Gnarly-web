# Karaoke microphone and export/share

Baseline: Gnarly-web `a0bcb7b`; native reference: NightcoreLab main `7644b2a` (`Sources/Karaoke` and `Sources/Share`). No backend or iOS files change.

## Defects addressed

- The Karaoke tab exposed lyrics settings, while microphone/scoring controls existed only in the expanded stage. The top recorder created an independent input session. Both surfaces now operate the same `KaraokeMicrophone` and scorer.
- Microphone activation awaited permission before resuming Web Audio. Activation now creates/resumes the capture context in the click, with generation cancellation, permission errors and resource cleanup. A pending grant cannot resurrect a closed session.
- Unvoiced, low-confidence input could previously earn presence points. The native RMS (.008), confidence (.65) and fundamental (65–1100 Hz) gate now applies. Autocorrelation selects the first strong local peak with interpolation, avoiding octave/subharmonic bias. Analysis runs in a module worker at at most 20 Hz with one transferable buffer in flight. Samples older than 300 ms are silence.
- Export buttons were informational placeholders and generated no files. All six buttons now open a working export draft.

## Native contracts adapted for the browser

Captured voice is analyzed locally, never monitored through the speakers or uploaded. Recording voice is a separate explicit action, capped at two minutes / approximately 32 MB. Closing, changing track or backgrounding releases capture. The same native audio element, queue, effects and MediaSession remain authoritative. Moving from the tab to the expanded stage reuses capture. Pausing awards no points; seeks start a new scoring run; late lyric arrival preserves earned points. Explicit empty LRC intervals exclude gaps.

Synchronized scoring uses the native 40% rhythm / 20% stability weights renormalized when verified harmony is absent, 100 points per voiced source second, verse ratings and a capped 1–4× multiplier. Without LRC, the existing explicitly labeled presence mode remains. Neither mode claims pitch accuracy without a verified melody. Result sharing follows the native text composer and excludes voice/lyric content.

Export freezes track, source position, rate, pitch behavior, bass/reverb, lyrics and visual settings. Draft-only theme, experience, material, typography, framing and quality controls leave the player unchanged. The actual preview canvas is the capture source. A manual `FluidVisual.renderFrame` uses the existing shaders without changing the live render scheduler. Export has a bounded shader surface; full-resolution artwork/text are composed at the selected output size. The obscured live background pauses its render loop while the dialog is open; music continues.

Profiles match native: portrait / square / landscape; 540 / 720 / 1080 short edge; maximum 15 / 20 / 30 fps; 1.6 / 2.8 / 5.5 Mbps. Lyrics cannot use the crop policy that would cut off text. The selected source excerpt is at most 15 seconds. Browser recording is real time, rather than native's offline, integer-frame AVAssetWriter pipeline; actual encoded duration and measured render throughput are reported in JSON. They are not a promise of frame-perfect capture or device frame rate.

PNG or video, frame-zero JPEG thumbnail and public JSON form the package. Native file sharing is invoked only by a separate user click. Individual media sharing and individual downloads remain available when multi-file sharing is unsupported. MediaRecorder format selection uses real feature detection: H.264/AAC MP4 is preferred on Apple; WebM VP8/Opus on Chromium/Firefox, with supported fallbacks. Files keep their actual MIME/extension. A bounded discarded frame-zero warm-up prepares capture before the timed clip. Empty, wrong-size or implausible-duration video is rejected. Cancel closes tracks, workers, contexts and URLs; backgrounding cancels export.

Audio export decodes only complete CORS-accessible/local objects (maximum 24 MB, tracks up to seven minutes), renders at 32 kHz with the existing bass/dry/wet/reverb values and impulse, and uses a bounded worker stretch for pitch-preserved rate changes. No new streaming engine, dependency, backend processing, FFmpeg download, extraction endpoint or storage layer is added. Export uses the original song, not live Stems/DJ output or microphone voice. Preview audio is never promoted to a full song.

## Verification

- `npm test` and `npm run build`.
- `node tests/karaoke-share.browser.mjs`: actual Chromium getUserMedia / Web Audio / worker / MediaRecorder with generated original tones; tab/stage reuse, paused score, permission failure, recording, cleanup, PNG/JPEG/video dimensions and real audio samples via ffprobe/FFmpeg, sharing, cancel, mobile viewport and offline pitch/rate DSP.
- `node tests/pause-resume.browser.mjs` and `node tests/ipod-hardware.browser.mjs` cover transport and existing hardware UI.
- `.github/workflows/karaoke-share.yml` retains synthetic acceptance files/screenshots as CI artifacts. No provider downloads or real voice data are used in CI.

Actual Safari/iPhone capture, physical microphones, Bluetooth routing, native OS share destinations and hardware GPU frame rates require device validation. Chromium mobile viewport tests are not Safari tests. CORS/provider restrictions and browser format support still apply; unsupported paths show actionable feedback and preserve the player.
