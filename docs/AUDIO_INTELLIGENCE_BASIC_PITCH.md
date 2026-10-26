# GNARLY — Audio Intelligence (Basic Pitch + Harmony)
 
This integration is **optional**. It does not interfere with playback, lyrics, download URLs, Web Audio nodes, shader rendering or Stems.

## Implementation

- [Spotify Basic Pitch TypeScript](https://github.com/spotify/basic-pitch-ts), Apache-2.0, used as an **official npm dependency**. Build with `npm install && npm run build:pages`.
- Our build bundles `lib/basic-pitch-worker.js` into `dist/basic-pitch-worker.js` and copies the model to `dist/models/basic-pitch`, serving assets from the GNARLY domain.
- The browser loads the inference engine only after pressing **Performance / DJ → Inteligência musical → Áudio → MIDI**.
- File input supports browser-decodable local audio, with 10MB file and first 25 seconds of audio analysis. Where the current track is a local file, use that file; otherwise the user must select a local recording manually.
- The audio samples are processed on-device. The files **are not uploaded to Cloudflare, Render or Spotify** by our code. The model is downloaded from our static assets after the user opts in.
- The inference is performed in a module `Worker`, canceled on track change/selection. Browser/WebWorker model support and real-device memory limits vary.
- `lib/music-note-intelligence.js` provides deterministic note filtering, heuristic triad/chord grouping, pitch-class tonal center, SMF MIDI export and **explicit** mapping to 16 MPC song-clip pads.
- Chord estimates are inspired by the analysis workflow of [Guitariz](https://github.com/Guitariz/Guitariz) (MIT); no code, ONNX weights, backend endpoints or UI are copied.
- [ChordSeqAI](https://github.com/PetrIvan/chord-seq-ai-app) (MIT) provided inspiration for chord/MIDI sequencing; no complete Next.js/ML package is installed.
- [metadata-extractor](https://github.com/lttkgp/metadata-extractor) and [music_analytics_scraper](https://github.com/caiosbl/music_analytics_scraper) are deliberately not integrated: they scrape unrelated stats/Spotify APIs and would duplicate GNARLY's metadata layer.

## Accuracy

**MP3 does not contain the original musical performance as MIDI data.** The output is a neural transcription guess, most accurate for **one instrument or one isolated Stem**, less accurate for dense mixes. Export `.mid` is a standard single-track MIDI approximation (no guaranteed pitch bend fidelity). The pad remapping maps extracted note timing/pitches to the existing song-sample pads; it does not reconstruct individual instrument sounds. 
The tonal center is a pitch-class peak, not a certified musical key. Chords are template-based estimates and may be uncertain.

## Operational QA

`npm test`, `npm run build:pages` and the mobile browser regression CI cover syntax, chord/pad conversion, MIDI file bytes and packaging. Since the ML inference is hardware-specific, it needs a separate physical-device check with a short owned mono instrument recording before calling it verified across Safari and Chrome.

Keep dependencies pinned; when Basic Pitch changes, review model licensing and browser compatibility before upgrading.
