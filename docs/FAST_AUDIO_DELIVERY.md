# GNARLY Web — Fast, reliable music delivery (2026-10-26)

## Non-negotiable invariants

Omnibox ranking and MusicBrainz/iTunes metadata enrichment never grant permission to download or change a track's playable source. The canonical YouTube video ID remains the only key passed to the existing first-party Render backend. No third-party unofficial streaming proxies, cookie sharing, embedded credentials, DRM circumvention, format downgrade disguised as full audio, or silent track substitutions.

## Applied optimizations

1. `preconnect`/DNS hint for the known Render origin saves handshake latency without triggering an audio extraction when the page opens.
2. Native Omnibox results render immediately when the backend search resolves; the iTunes metadata lookup continues concurrently, then conservatively enriches *matching versions only*. Results and search history remain keyed by the same IDs.
3. After an explicit Play action, the existing HTMLAudioElement uses `preload=auto` and progressive native `/download?delivery=browser`, allowing the browser to buffer without any extra parallel fetches or duplicate extractions.
4. For browser media errors 2 (network) and 4 (unsupported/unavailable), or an equivalent `NotSupportedError`, the app makes **at most two** spaced retries (450 ms, 1200 ms). Both use exactly the same canonical ID and first-party backend. Cache-busting uses a bounded `retry` query parameter; extraction and R2 cache stay the backend's responsibility. No retries for blocked autoplay/aborts. No retry on track change or explicit pause. Errors remain visible after the bounded budget.
5. The full audio source is never prefetched by Cloudflare Workers or Netlify Functions: their existing catalog/metadata responsibilities are unchanged, and the media bytes stay on Render and its R2 cache.

## Repository assessment (conceptual references, no copied code)

- **Stash**: useful cache/offline and queue-resilience concepts; Kotlin/Android architecture is not directly portable to web media.
- **YouMusic**: useful playlist and continuous listening design; Android InnerTube client is not a safe drop-in web backend.
- **Arroxy** and **EGM-Downloader**: mature UI ideas, but desktop extractors built around yt-dlp; Gnarly's Render backend already uses yt-dlp and copying their GPL/AGPL code would add complexity and licensing obligations.
- **PackJC/YoutubeToMP3**: Windows/.NET GUI and audio conversion, not a browser transport.
- **aman-roy/mp3_downloader**: old youtube-dl script, not suitable for contemporary resilient services.
- **Ximalaya-Downloader**: archived and tied to Ximalaya, not compatible.
- **yandex-music-download**: provider-specific Perl client, not compatible.
- **mohd-baquir-qureshi/music-api**: README explicitly says deprecated, so it is not a reliable fallback.

## Verification

`npm test`, `npm run build`, and Safari/iPhone real audio smoke test with *authorized* tracks. Watch for browser media codes, Render HTTP statuses and R2 hits. Browser MediaError does not reveal HTTP status, so no code should claim it identified a server 403/422 from MediaError 4. This design improves probability and perceived speed; it **cannot guarantee** every externally hosted song is accessible.
