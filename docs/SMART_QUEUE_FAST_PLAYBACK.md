# GNARLY WEB — Fast Playback + Smart Queue (October 2026)

## Background and native inspiration

Read `NightcoreLab/Sources/ContentView.swift` (`PlaybackQueue`), `PlaybackCoordinator.swift`, and `Recommendation/DiscoveryEngine.swift` in the iPhone app.

Translated native invariants without duplicating Swift code:
- Queue items remain in Up Next until the HTMLAudioElement actually fires `playing`; failures don't discard them.
- Additions are deduplicated against currently playing track and all earlier user-added items.
- Recommendation-driven auto-fill **appends**; never clears, reorders or replaces manual selections.
- This is not audio-feature similarity: the web currently has *verified text artist/album*, not the iPhone's acoustic discovery vectors. Do not claim BPM-based mixing without comparable analysis.

## User experience

From Omnibox → **Fila**: `Manual` (default), `Artista`, `Álbum`, `Mix`, `Playlist`. Select `Artista` or `Álbum` after playing a song with verified credits. Bounded background discovery queries the existing native Gnarly catalog; only songs from the same artist (and for Album, matching album) enter the queue. `Mix` rotates across albums by the verified current artist. Results are deduped and recent listens filtered.

Queue rows have **up/down/remove** controls. Selecting a queued track stages it until playback is confirmed; if it fails, the queue entry remains available for retry.

Named playlists are metadata-only, saved locally under `gnarly.web.playlists.v1` (max 12 lists, 80 entries each). `Meu Mix` is permanent. Playlists can be created, deleted, saved to, selected and appended to an existing queue. Uploaded local files are playable in the session but never stored as stale blob URLs in a persistent playlist. Playlist mode uses saved music without remote searches. Artist/album modes auto-fill when the queue has fewer than two entries.

## Playback latency and error policy

- Critical fix: old `mediaList` had `tr.source='preview'`, overwriting actual `source` merely by rendering the list. This corrupts YouTube playback selection. New rendering checks `tr.source === 'preview'` without mutating the track.
- First opening the Busca/Fila warms Render with a single low-cost `/health` request, never `/download`. It is non-blocking and no-cors; it can hedge idle cold start, but does not guarantee the Render service is ready.
- Existing preconnect, bounded same-track retries and in-memory buffering are retained.
- Playback startup timing is logged only locally in the console (no telemetry or extra backend calls).
- **No speculative full-track downloads**. Extracting many tracks concurrently before listening would waste provider requests/Render resources, bandwidth and battery, and trigger 429/403/422. No DRMs or authentication restrictions bypassed.

## Testing and integration

`npm install && npm test && npm run build:pages`, mobile Playwright UI suite, manual tests on Safari: next/reorder, queue failure, playlist persistence, artist/album verified metadata, provider outages, direct URLs, and low memory.

Maintain feature parity with concurrent PRs (especially Basic Pitch MIDI) by integrating against the latest main; don't replace it with a stale branch.
