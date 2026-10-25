# GNARLY WEB — Stage 72 parity project (α5)

Web implementation of the [GNARLY iOS / NightcoreLab](https://github.com/miscrapha-DELTA-IA/NightcoreLab) player. The iOS architecture is the technical target, not merely a visual reference. **1:1 parity is the final goal and has not yet been reached.**

Live demo: https://gnarlyweb.netlify.app/ · Netlify deployment connected to `main`.

## What works now

- Responsive player, one HTMLAudioElement / Web Audio graph, queue, favorites, local history and Music controls.
- **Original / Nightcore / Slowed / Slowed + Reverb**, bass and pitch-preservation switch for streams the browser may process.
- Stage 72 inspired Omnibox: search, deduplication, history and recognition of pasted YouTube links/IDs.
- Preferred search results are native backend song records; iTunes 30-second previews only appear when the native music source is unavailable.
- Direct **internal** M4A audio through the existing Render `GET /download?url=...` (only after clicking Play). No automatic YouTube pop-up, login modal or file picker. **Audio availability depends on Render and YouTube; the user's authorizations remain required.**
- Auto synced lyrics from LRCLIB when a matching record is available; optional LRC upload; local file import and photo background.
- WebGL2 visual engine with the original Swift palette color values; not yet pixel-perfect versus Metal on iPhone.

## How playback works (α5)

`Omnibox → YouTube Music metadata → canonical 11-character video ID → Render FastAPI GET /download → M4A → HTMLAudioElement → Web Audio DSP + visualization.`

The Render API already serves the iOS app. Its FastAPI CORS middleware explicitly permits `https://gnarlyweb.netlify.app`, keeps `AccessControl`, request quotas, yt-dlp safeguards and validation. The browser does **not** receive backend tokens, accept arbitrary extraction URLs, or automatically open YouTube. If a particular track fails (403/422/429/timeout), the GNARLY UI shows an error; choosing the official YouTube player is manual in **Música**. The legacy 19 MB Netlify proxy and its invitation login were removed.

**Important:** CORS is not authentication, not a licence, and does not authorize copying or modifying third-party music. Only use sources and files you are entitled to access/process. The site is not intended to become an unrestricted public extractor. Do not add secrets to web JavaScript or version control.

## Tests

```bash
npm test
node --check app.js
```

`npm test` checks metadata/source selection, safety validation, login-free native URL building, music presets, lyrics, and Omnibox behavior. An optional local browser smoke (`tests/browser_smoke_alpha5.py`) uses Playwright/Chromium and a synthetic mock audio stream — not a real copyrighted music download.

**CI is not real-device playback verification**. Test the deployed GNARLY WEB in iPhone Safari with a track you have permission to use, and check server `403`, `422`, `429` and `5xx` statuses. Render can take time to process a cold request, and browsers restrict autoplay. Backend access may be strict, requiring a separate secure session design rather than embedding credentials into browser code.

## Deploy

Netlify → Import existing project → GitHub repository `miscrapha-DELTA-IA/Gnarly-web` → `main`, blank build command, publish `.`. `netlify.toml` configures public files and Omnibox/catalog Functions. Render uses the separate `NightcoreLab` `main` branch and `backend/` root. Do not deploy the iOS project to Netlify.

## Still to reach true Stage 72 1:1

- GPU shaders with material physics and source-clock-matched audio reactivity, not just Swift palette colors.
- Full controls/presets of the Swift playback engine, native-grade pitch shifting, queue prefetch and transitions.
- Stems, creator/pads, all lyric typography modes, microphone karaoke/scoring, MP4 export.
- Per-source rights/admission policy, complete failure resilience, real-iPhone testing and performance parity.

See [exact Omnibox implementation contract](docs/OMNIBOX_STAGE72_CONTRACT.md) and [parity matrix](docs/STAGE72_PARITY.md).
