# Playback performance overhaul — 2026-10-28

Baseline: GNARLY WEB `d631ebb`; shared backend `7644b2a` (fresh main checkouts).
Branch in both repositories: `perf/playback-responsiveness`.

## A. Root causes and playback trace

The existing architecture already used one native HTMLAudioElement, R2-first delivery,
selection generations, immediate transactional queue consumption, and bounded extraction.
These mechanisms were retained, including the iOS native renderer/DSP opt-in architecture.

1. `app.js:prepareNativeAudio` compared absolute `audio.src` to a relative edge path.
   Resume on a Cloudflare host reassigned the same source and restarted resource selection.
   Real native-media regression test: 20 initial plays plus 20 resumes produced 40 media
   requests before and 20 after. No `audio.load()` was added.
2. `/stream` called `to_thread(_discover_progressive_aac)` independently per request, with
   a 13-second waiter deadline. Concurrent Range requests could repeat the same yt-dlp
   metadata extraction and queue threads behind the process gate.
3. `/stream` did not join a full extraction already accepted by `/prepare`.
4. Edge `/fast-prepare` always woke Render, including when R2 already contained the track.
5. Warmup remembered a failed identity forever until reset, while selection reset that
   memory entirely. Requests could be permanently suppressed in one selection or repeated
   across navigation. The late-track timeupdate path bypassed the eight-second buffer gate.
6. Rapid Next during an empty-queue discovery collapsed multiple presses into one intent.
7. Invalid upstream responses were discarded without canceling their bodies. Provider
   cooldowns could trigger a pointless second origin request. Upstream header waits had
   no edge deadline. Promotion duplicated the complete payload in a chunk list and a
   concatenated array; offline download did not check declared length at EOF.

Actual sequence after this change:

- Selection synchronously reserves/consumes the queue, cancels obsolete HTTP waiters and
  attaches an offline blob immediately if available. Otherwise native playback requests
  `/fast-audio/<canonical-id>` on the existing approved Cloudflare hosts.
- Edge performs one R2 GET, with the original Range header. A hit returns directly with
  200/206 metadata; no Render request or separate cache-probe request precedes it.
- A miss attempts `/stream`. Render checks its local file cache and existing extraction,
  then bounded, shared progressive discovery. Positive metadata TTL is 180s, negative
  TTL is 8s; at most 64 entries and two discovery tasks per process.
- Discovery waits at most 2.5s; the real worker retains its slot until it finishes. Busy
  metadata probes fail fast rather than accumulating behind foreground extractions.
  An edge progressive *header* deadline is 6s, after which the existing `/download`
  fallback joins existing extraction work. There are no parallel hedged download jobs.
- Progressive bytes stream through immediately. A bounded independent tee promotes only
  complete MP4 objects with valid length/full-span range and an `ftyp` signature. Conditional
  R2 put does not overwrite an object another request already promoted.
- The browser's buffering/decoder and native `playing` event determine measured startup.
  After playback is stable with >=8s buffered, precisely one actual next queue candidate
  is prepared. Offline candidates, Data Saver, 2G/3G, pause and initial buffering suppress
  speculative work. Server-side preparation declines excess speculation, preserves
  accepted reservations on client disconnect and leaves foreground admission separate.

No visuals, styles, shaders, layouts, effect graph, provider identity rules, authentication,
licensing checks, native iOS files or production deployment configuration changed.

## B. Implementation

- `app.js`: canonical source comparison, duplicate-play guard, discovery intent isolation,
  one warmup gate, anonymous instrumentation and development-only startup debug logging.
- `lib/queue-audio-warmup.js`: bounded TTL/backoff ledger, obsolete waiter cancellation,
  persistent reservation tracking and low-priority request hint.
- `lib/offline-library.js`: complete response length validation before saving a blob.
- `lib/playback-metrics.js`: maximum 120 completed anonymous samples; startup percentiles,
  first-byte timing when Resource Timing exposes it, completed media-request counts,
  recovery/failure counts, buffering ratio and rebuffer events per listening hour.
  Read locally with `(await import('/lib/playback-metrics.js')).playbackMetrics.snapshot()`.
  No telemetry is uploaded and no song IDs, titles or URLs are retained.
- `functions/fast-audio/[id].js`: cancellation/deadline, safe partial headers, cooldown
  preservation, rejected-body cleanup, bounded promotion and separate edge/origin timing.
- `functions/fast-prepare/[id].js`: direct R2 readiness check before reaching Render.
- Shared backend `fast_stream.py`, `main.py`: bounded metadata cache/single-flight,
  prepared-job reuse, preparation admission/lifetime fixes, additive metrics counters.
- Automated native-media benchmark and a dedicated PR workflow; targeted unit regressions.

## C. Measured comparison

**These are local fixture timings, not production TTFAP or acoustic-output measurements.**
System Chromium, headless, synthetic 12s AAC, native HTMLAudioElement and real app/DSP.
Twenty samples per scenario. Both revisions run sequentially using the same harness.
R2 lookup is simulated at 15ms; progressive origin at 90ms; fallback uses two 120ms
responses; high latency uses a 250ms origin. Playwright fulfills fixture responses after
handler completion, so this benchmark does not model sustained progressive bandwidth.
Separate stream tests verify delivery of the first chunk before EOF or cache promotion.

Click-to-`playing`, milliseconds (p50 / p95); p99 is noisy with only 20 observations:

| Scenario | Before p50 / p95 | After p50 / p95 | After p99 | Media requests / 20 samples |
| --- | ---: | ---: | ---: | ---: |
| offline | 30.4 / 65.5 | 42.4 / 80.3 | 1106.3 | 0 → 0 |
| r2-hit | 64.1 / 87.6 | 67.2 / 103.8 | 109 | 20 → 20 |
| prepared-next | 44.2 / 81.6 | 82.1 / 105 | 106.4 | 20 → 20 |
| cold-progressive | 127.2 / 188.4 | 133.2 / 175.5 | 179 | 20 → 20 |
| cold-fallback | 293 / 319.3 | 301.6 / 347.5 | 350 | 20 → 20 |
| high-latency | 285.6 / 312.7 | 286.3 / 363.2 | 377.3 | 20 → 20 |
| resume | 37.6 / 71.4 | 1.9 / 23 | 43.8 | 40 → 20 |

Resume improved substantially and removed all 20 redundant reload requests. Initial R2,
next and cold-path medians did **not** improve in this fixture; some increased. These
results do not support a blanket faster-startup claim. The first sample creates the
existing audio graph and loads the full visual experience, which explains some offline
tail variance; effects architecture was deliberately preserved. The ready-next fixture
starts from an already populated R2 object, rather than proving a real provider prewarm.

Cold progressive uses one origin request/song; unsupported progressive uses two. R2 hits
and offline tracks use zero origin requests. Missing first-byte timings remain null.
Raw p99, observed first-byte p50/sample counts and request counts are in the JSON artifacts.

The shared backend's separate, repeatable 20-request contention fixture (40ms synthetic
metadata cost, two worker slots) reduced metadata calls from 20 to 1 and p95 discovery wait
from 402.4ms to 40.9ms. This proves coordination savings, not real yt-dlp extraction speed.

We kept one speculative recording. A second would increase bandwidth/CPU while these
fixtures already meet the next-ready target; there is no measured evidence here that
justifies a second whole-song preload. No new streaming engine or runtime dependency.

Production cache hit ratio, acoustic TTFAP, live extraction percentiles, provider failure
rate, long-session buffering ratio and rebuffer events/hour are **not measured** here.
The bounded local diagnostics and additive backend counters support later observation.

## D. Regression validation

- Baseline: 284 frontend tests; 126 backend pytest tests.
- Updated: 294 frontend tests; 134 backend pytest tests (38 subtests); 89 unittest tests.
- Real-media fixture: offline, R2 hit, prepared next, progressive miss, fallback, latency,
  resume; rapid Next before previous play settles; karaoke open; stale recovery; native
  ended/seek transition; keyboard headphone transport; offline with browser network disabled;
  multiple pending discovery intents; no uncaught page errors.
- Existing smart queue, playlist/manual ordering, MediaSession, iPod, background/iOS native
  transport and visual contract tests remain passing in the unit suite.
- Streaming tests: first chunk before EOF, 206/ranges, malformed partial responses,
  truncated/oversized/interrupted/corrupt cache promotion, provider 429, deadline fallback.
- Warmup tests: deduplication, bounded backoff/reservations, offline, Data Saver and slow
  connection policy. No sustained bandwidth-throttled listening test was performed.
- Build and Wrangler dry-run pass. Existing visual browser suite status is recorded below.
- WebKit launch blocked by missing host libraries; privileged dependency installation
  unavailable. Real iOS Safari, Bluetooth hardware, locked-screen and background-duration
  tests remain required. Do not interpret static compatibility tests as device acceptance.

## E. Delivery and deployment

Small commits on dedicated branches; shared API contracts stay compatible. No production
merge or deployment is performed. Frontend and backend changes work independently, allowing
staged rollout/revert. The backend health probe timed out after 25s with zero response bytes;
this is insufficient evidence to diagnose a cold start or claim production health.
CI/PR status and browser-suite outcomes are recorded in the delivery notes below.

## F. Remaining limitations and rollout

Provider discovery may outlive the waiter deadline: Python cannot kill a running yt-dlp
thread. Its real gate remains held, so resource usage stays bounded. Download fallback may
still wait for provider/network/extraction and can never guarantee uncached <2s startup.
A separate provider metadata resolution may still be needed by the legacy download fallback;
this change avoids simultaneous duplicate discovery and repeated stream lookups, rather than
rewriting download/extraction formats. Progressive connections are still opened per request.

Promotion uses a single bounded <=16MiB side buffer (down from two full copies), not zero-copy
R2 persistence. Streaming to the listener never waits for it; oversized/unknown-length media
is not promoted at the edge. Header/signature/length checks cannot prove full codec integrity.
Cache fills still depend on eligibility and waitUntil lifetime; complete extraction upload
remains the durable fallback. Source cache/in-flight sharing is process-local, not distributed.

Offline blobs are already indexed in memory once the existing IndexedDB hydration finishes;
no duplicate large-file storage layer was added. iTunes previews remain separate from full songs.
Visual renderer and effects were left intact because no measured defect justified changing them.

Before production rollout: inspect PR CI, validate a real iOS device and long background
session, then measure real cache-hit/cold/prepared playback with local metrics. Compare cache
hit ratio and bounded extraction counters over equivalent traffic. Revert the focused runtime
or edge commit independently if failures/rebuffering increase. Do not deploy the shared backend
on the strength of synthetic timings alone.

## Delivery notes

- Runtime commits: `993f7ce` (transport/queue/offline/diagnostics), `5c9d951`
  (edge delivery and promotion). Test harness/workflow: `808a38b`, followed by
  `4e6f3e7` (real MediaSession handler, recovery and slow-delivery regressions).
- Companion shared-backend draft PR:
  https://github.com/miscrapha-DELTA-IA/NightcoreLab/pull/159
  (`a7f6110` runtime, `f67831b` benchmark/report).
- Karaoke layout browser suite passes desktop, mobile portrait and landscape.
- Existing Stage72 browser suite fails at its unchanged line 646: expected
  `/para você/i`, actual `RESULTADOS DA BUSCA`. The same queue→search sequence
  on a clean `d631ebb` baseline reproduces that heading. The assertion remains
  untouched; this performance change does not claim a fully green UI workflow.
  An earlier concurrent run also timed out during desktop screenshot capture.
- Additional final native-media regression run passes real registered MediaSession
  handlers, recovery after a failed initial HTTP media request, and startup with a
  synthetic 64KiB/s-equivalent complete-response delay, without uncaught page errors.
  This slow-delivery check is not a sustained-bandwidth streaming benchmark.
- All JavaScript syntax checks, CI asset exclusions/sizes, Pages build and final
  Wrangler 4.154.0 dry-run pass. Worker bundle: 37.81KiB / 10.61KiB gzip.
- Remote Actions status is available from each PR. Neither PR is merged and no
  deployment is claimed; physical iOS/background acceptance remains outstanding.
