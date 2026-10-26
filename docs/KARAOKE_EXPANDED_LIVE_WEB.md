# GNARLY Web — Karaoke Ao Vivo / Expanded Stage

## Base (não reverter outras abas)

Created from GNARLY Web main `3d0a409e2ff6459d750ea28cb927b9a82ccd3a91` (the latest main read at the start of work), with its existing Aa typeface datasets, manual scope, Smart Queue, WebGL themes, DJ/MIDI, audio backend, lyric loaders and streaming recovery intact. Before merging, compare main again.

## Native code studied

- `NightcoreLab/Sources/Karaoke/KaraokeScoreHUD.swift` — score, combo, microphone explicit opt-in, singing controls, status and absent pitch reference
- `NightcoreLab/Sources/Karaoke/KaraokeScoringEngine.swift` — source-time integration; no scoring by render frame; score only from microphone evidence, no fake pitch confidence
- `NightcoreLab/Sources/Karaoke/KaraokeVoiceAnalyzer.swift` — normalized autocorrelation, low voiced threshold, isolated capture
- `NightcoreLab/Sources/Karaoke/KaraokeFocusMode.swift` / `KaraokeLyricsView.swift` — focus scrolling, active line, return to live

These concepts are ported to the browser; SwiftUI and AVAudioEngine aren't copied.

## UX

1. The previous floating lyric remains above the player, now with a tiny microphone symbol at its right edge. Tapping expands a fullscreen, frosted singing stage; it does **not** request microphone access.
2. Stage reuses **the exact existing HTMLAudioElement** and `state.current`, `state.lyrics`, `state.plainLyrics`, `state.lyricsSynced`, `state.lyricStyle`. A single source of playback truth.
3. Cover, title, artist, player Play/Pause on the existing HTMLAudioElement, microphone opt-in, live voice-only recording, caption font menu (14 quick presets plus complete Aa catalog), score panel and combo, synchronized active LRC lines, manual scroll, `Voltar à letra ao vivo`, caption-source status, return-to-compact button.
4. The selected karaoke font is retained through the existing artist/song/global preference service. Scores reset on a new track; audio remains unchanged when opening or closing.

## Microphone permissions and recording

- User initiates `getUserMedia({audio: ...})` with echo cancellation and noise suppression; no automatic permission prompt.
- Microphone is a separate MediaStreamSource -> AnalyserNode. A zero-gain sink keeps the microphone analysis graph running reliably (including Safari) with **inaudible output** and no connection to the playback WebAudio engine, backend or telemetry.
- Only ephemeral, bounded 2048-sample normalized-autocorrelation frames (voice frequency + confidence + RMS) at about 11Hz. Audio does not leave the device. A chosen `Gravar voz` action uses the same mic stream, then saves a voice-only file locally, without the commercial backing track.
- Stream tracks, timer, nodes and audio context are disposed when the stage closes, another track is selected, the page becomes hidden or the page unloads. An older outstanding permission request cannot reopen capture after the modal closes.
- Safari/microphone denial shows status; playback still works. Recommend headphones against music leakage.

## Accuracy caveats

The Web's current LRC sources primarily contain **line** timestamps. Word-by-word timing and a verified melody/key reference are NOT universally available. Consequently, the v1 competitive metric is **explicitly labeled “Ritmo e presença · tom indisponível”**, using microphone voicing over confirmed line intervals. Sine/autocorrelation frequency may be shown as measured Hz; it is **not** claimed to be harmonic accuracy or pitch grading without a trustworthy musical reference.

Untimed/plain lyrics remain readable; scoring is disabled. Large jumps, seek and stalls cannot create fake points; score integrates delta source time, not UI render frames. The native-like combo/rating is generous and has limits rather than unsupported precise lyric-word or pitch claims.

## Files

- `lib/karaoke-live-score.js`: microphone evidence / bounded source-time scorer.
- `lib/karaoke-microphone.js`: opt-in mic, bounded analysis and explicit recording.
- `ui/karaoke-stage.js`: fullscreen lyric, score and controls.
- `karaoke-stage.css`: native-inspired immersive presentation responsive on mobile.
- Integration in `app.js` and compact icon in `index.html`, Pages allowlisted asset.
- Unit and browser regression tests.

## QA / limitations

- Run `npm test`, `npm run build:pages`, existing Stage72 browser WebGL/UI suite and new expanded-stage browser scenario.
- Real Safari device must verify permission flow / mic context support, vocal intelligibility and FPS; CI mocks cannot validate microphone hardware.
- Playback navigation, pause, queue, audio error/recovery and visual/material/shader state must not be altered.
