# GNARLY Multi-Source Engine — 30 Oct 2026

The Web player still starts the **same native HTMLAudioElement** immediately
inside the user's gesture. Offline IndexedDB and R2 edge media remain the
first native options. New-source discovery starts **concurrently** with
that Play, not ahead of it. No speculative full download, extraction storm,
forced visible YouTube iframe, preview masquerading as a song, or UI change.

## Active sources

| Source | How it starts | DSP/stems |
| --- | --- | --- |
| Offline import/download | IndexedDB/blob native player | Browser media capability dependent |
| Exact R2 audio | /fast-audio/<youtube-id> cloud edge | Native media; WebAudio when CORS/routing supports |
| Render source | Existing /stream + /download under backend limits | Existing player semantics, subject to YouTube 429/403 |
| Audius | First-party /api/audius-search, then /audius-audio/<id> | First-party same-origin audio; verified full bytes |
| Jamendo | Optional /api/jamendo-search, then /jamendo-audio/<id> | Same-origin MP3, if enabled and track available |

Jamendo is **OFF** until the Cloudflare Pages production environment has
`JAMENDO_CLIENT_ID` (the client ID issued by the Jamendo developer portal).
Configure it separately for `gnarly-web-pages` and `gnarly-web-stage72`
if both environments should use this source. Do not commit credentials.
Without it, Jamendo returns `503 {status:"not_configured"}` quickly and
Audius/other playback paths continue unchanged.

The independent source router races providers, and selects ONLY when the
same normalized title, credited artist and duration within two seconds match,
an ID-only first-party URL is valid, and an actual partial GET returns a
valid supported audio content type AND audio signature (not JSON/HTML).
Source errors have **per-provider** 30-second breakers after three failed
audio probes: an Audius outage cannot quarantine Jamendo, R2 or Render.
On Next/Pause and when the native song starts playing, unused provider
probes are canceled. No new request is directed to YouTube by the router.

**Important:** Full commercial-catalog coverage or cold-origin startup under
three seconds is NOT guaranteed. Both independent sources have different
catalogs; if a recording is absent there and not in R2/offline, current
YouTube/Render 403/429 cannot be magically repaired. No extracted stream
is created from metadata. Reproduced material from licensed/DRM platforms
may not expose raw audio to the GNARLY DSP or stem splitter.

## Acceptance criteria

- Playback starts without awaiting alternative providers and preserves native
  iOS gesture/MediaSession behavior.
- Validate true first bytes on the exact recording; no preview or wrong remix.
- Check source A failure while source B succeeds; cancellation on Next/Pause.
- Keep PWA import graph updated by rotating `SHELL` in `sw.js`.
- Run `npm test`, Cloudflare Pages build, browser visual regression suites
  and live cached-media smoke. Performance reporting must separately include
  click-to-playing P50/P95 for **cached** and **uncached** recordings on
  actual Safari; mock unit tests are not evidence of 3s real streams.
