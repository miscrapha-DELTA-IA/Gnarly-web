# GNARLY Web — local-first streaming & offline media (2026-10-27)

## Goals and measured limits

- Play downloaded music with **zero backend round trips**, even in Airplane mode, after the listener closes and relaunches the PWA.
- Keep startup fast online via the existing HTMLAudioElement progressive M4A delivery, connection warmup, Render R2 cache, and **single** resource-selection sequence. We removed an unnecessary empty `audio.load()` between selection and Play.
- Do not pretend to guarantee 0 ms first byte for songs not in local storage: cold extraction, DNS, R2 misses, radio interference, unavailable sources and iOS autoplay/interruptions are outside JavaScript's control.
- Per-installation anonymous profile ID isolates downloaded tracks inside IndexedDB. Search history, Mix recommendations, likes, theme and player settings remain local to this browser profile via existing localStorage. **There is no cross-device account/sync**, and two humans sharing exactly the same browser profile are not distinguishable; explicit account auth and server sync would be a separate feature.

## Offline pipeline

1. The browser installs `sw.js`, which precaches the entry HTML, core CSS, app modules under `lib/`, `ui/`, and local icons. Build produces `offline-assets.json` so even files imported lazily can be available on first offline launch.
2. The user may import audio files directly. Files under **72 MiB** (a supported audio MIME/extension) get an immediate `blob:` playback source; IndexedDB saves the same raw bytes plus bounded metadata in a per-installation namespace. If storage is denied, the current session remains playable with an honest warning.
3. Each verified song in the GNARLY music catalog can be saved explicitly using its **↓** action (or **Mais → Baixar música atual**). One GET to the existing first-party `/download?delivery=browser` endpoint downloads the complete audio. HTTP 206 partials, unexpected MIME, small error bodies and oversize files are rejected. No unrequested bulk download, insecure third-party mirror, credential copying or bypass.
4. Saved songs in the **Biblioteca offline** open a `blob:` URL before audio starts; all queue, Nightcore/Slowed preset, headset/MediaSession, karaoke and visuals continue to use the **same** player. Saved YouTube tracks keep their original canonical ID, and the original web delivery remains available if the user explicitly deletes a saved copy.
5. The artwork, history, favorites and smart queue are browser-origin local metadata. Online discovery and new downloads still require internet. Downloaded tracks and user-imported tracks work without network. SW intentionally ignores API requests and remote music; music bytes belong solely in the personal IndexedDB library.

## Latency / robustness design

- No duplicate `audio.load()` on each YouTube selection; attach the source once in Play (inside the user gesture).
- Local downloaded files route directly into the existing HTMLAudioElement: immediate resource availability and seeking without HTTP Range support.
- Backend continues to use Render + Cloudflare R2 hit/miss logic. If a track is not saved, `preload=auto` allows progressive buffering; retry budget remains bounded and source ID never silently changes.
- Do not prefetch entire unrelated or algorithmically suggested songs as network traffic: this can increase provider 429s, battery/bandwidth, and delay currently playing music.

## Repository architecture survey

- [**minht11/local-music-pwa**](https://github.com/minht11/local-music-pwa): on-device files and IndexedDB portability across browsers; useful reference for local ownership.
- [**dbeley/stave**](https://github.com/dbeley/stave): a separated local media resolver, download manager, Auto-DJ, per-browser queue and source indicators.
- [**bloggermohiuddin/music**](https://github.com/bloggermohiuddin/music): PWA offline-first IndexedDB Blobs, versioned shell and playback controls.
- [**navidrome/navidrome**](https://github.com/navidrome/navidrome): server-side streaming, low resource overhead and proper authenticated multi-user libraries. Its UI is not itself a browser-offline audio library.
- [**jellyfin/jellyfin-web**](https://github.com/jellyfin/jellyfin-web): reusable media-client abstractions for self-hosted playback.
- [**EnesYilmazcode/Melody**](https://github.com/EnesYilmazcode/Melody): iOS PWA imports audio into IndexedDB and plays it via local object URLs.
- [**WebTunes**](https://matteob.dev/blog/webtunes): per-user R2 URL/Range delivery, metadata in IndexedDB, offline Cache Storage. The next architecture tier, requiring an account/sync backend.
- [**OpenSubsonic/Navidrome clients**](https://navidrome.org/apps/): examples of gapless playback, caching and account-isolated libraries (Airdrome, Amcfy, ampcast).

These projects informed independent implementation choices. Their engines/source code were **not copied** into GNARLY. Mapping every streaming repository worldwide isn't feasible; these cover the main architectures applicable to the current FastAPI/yt-dlp/R2 + static PWA setup.

## Acceptance / constraints

- `npm test`: IndexedDB per-profile persistence and deletion, validation of full downloaded bytes, audio and profile identities, service worker separation.
- `npm run build:pages`: includes SW and generated offline shell manifest with full JS import graph.
- `tests/stage72-browser.mjs`: import WAV, verify IndexedDB, reload controlled PWA while network off, open local Library and confirm `audio.currentSrc` is a playable Blob.
- **iOS Safari physical validation:** PWA installed from Safari → add to Home Screen, import/download, verify launch in Airplane mode, media lockscreen and headphone behavior. Browser storage can still be evicted by Safari/iOS under pressure or in private browsing; offline access is conditional on storage retention. No PWA can promise an iOS background entitlement.
- Offline media stays local to browser origin and install profile; deleting Safari site data/app can erase it. Backup/export and multi-device sync require separate user-facing features.
