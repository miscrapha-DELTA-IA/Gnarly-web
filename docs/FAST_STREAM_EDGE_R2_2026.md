# GNARLY Fast Stream — edge R2 + progressive source + durable queue preparation

## Read first
This is an **additive delivery path**. It does not copy another user's data,
bypass a provider's access controls, or promise instantaneous decoding of a
song that no service has fetched. No app UI was redesigned.

### Current pipeline (before this patch)
Player -> Render `/download?delivery=browser` -> R2 internal proxy or
local cache -> cold complete yt-dlp metadata + full audio download + optional
FFmpeg -> response. A recently added 64KiB HTTP Range warmup closed the
connection before extraction finished, which often prevented R2 promotion.

### New path
1. Browser on the two official GNARLY Pages hosts requests
   `/fast-audio/{canonical-video-id}` **on the same origin**.
2. Pages Function reads private R2 object `{id}/audio.m4a` using
   `GNARLY_AUDIO_R2`. The body streams out of the Cloudflare edge with
   HTTP 200 or 206 (single Range, correct Content-Range). **No Render hop.**
3. On an R2 miss, Function tries the backend's **optional** `/stream`:
   bounded yt-dlp metadata-only lookup chooses a direct, browser-compatible
   AAC/M4A stream. The backend proxies audio progressively without waiting
   for the full file or a FFmpeg conversion.
4. If no compatible source is found, use the existing robust
   `/download?delivery=browser` extraction path. Retry attempts bypass
   the Pages edge to avoid repeated failures. Other browsers/domains and
   native iOS use the proven backend route.
5. During the final **75 seconds** of a song (only one next track,
   no Save-Data/2G/offline), the browser posts `/fast-prepare/{id}`.
   Render's `/prepare` creates one shared extraction task, returns 202
   immediately, and persists it until R2 promotion, even when the
   browser closes the request.

### Cloudflare configuration (required to enable true edge hits)
The bucket exists: `gnarly-cache`. Both Pages projects
`gnarly-web-pages` and `gnarly-web-stage72` must have the R2 binding:
`GNARLY_AUDIO_R2` → `gnarly-cache` in **production and preview**
bindings. The Pages service **must be redeployed after binding**.
No S3 keys are included in source code, client JS or response headers.

### Performance verification
Track **time from user tap to `audio.playing`** (already logged by GNARLY)
in browser DevTools. Classify delivery using the response's
`X-Gnarly-Playback-Source` header:
- `r2-edge` (cache hit, no origin connection),
- `progressive-origin` (uncached AAC stream),
- `extraction-origin` (existing full download fallback).
Response `Server-Timing` records edge elapsed and fallback mode.

Goals (not claimed measurements):
- offline file: first audible sound ideally <200ms when device is ready;
- edge R2 hit: ideally <1s on a good network;
- uncached compatible source: stream onset without waiting for full download;
- otherwise preserve existing correct play/retry.

The current 7-day R2 lifecycle still applies. Render free instance sleeps,
CDN routing and missing upstream formats can still delay uncached songs.
Users have separate local preference/history/playlist data; the R2 media cache
is shared **only by canonical recording ID**. Do not attach per-user
cookies/tokens to the R2 response. Do not claim provider-independent
instant streaming or pretend a different recording is the requested track.

### Rollback
Disable the R2 binding or switch `trackAudioURL()` back to the Render URL.
The original `/download` remains operational and is never removed.
