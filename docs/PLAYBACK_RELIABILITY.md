# Playback, queue and search recovery

Baseline: main `34fdb0b` (PR #55). No visual styles, native iPhone code, backend API contracts, credentials, service plan or audio effects graph are changed.

## Confirmed defects

| Trigger | Before | Correction |
| --- | --- | --- |
| Smart mode with an empty upcoming queue | Player/iPod Next and MediaSession Next were disabled, preventing discovery. | Transport availability includes intelligent discovery; current audio continues until a successor exists. |
| Select another song while recommendations are pending | The old global pending job could block the new anchor, discard its result, and never refill. | Selection-bound operation, cancellation, shared readiness promise and bounded retries. |
| Empty/temporary recommendation failure | The seed was consumed permanently for that selection. | Only useful results consume it; two background retries at 15/30 seconds, explicit retry available. |
| Rapid Next while discovery is pending | Multiple intentions collapsed into one transition. | Pending intentions are counted and consume distinct queue items transactionally. |
| Previous, Pause or Clear while Next is waiting | A late response could resume playback or consume a newly added manual song. | A navigation revision invalidates pending transitions; Previous preserves the interrupted song in the forward queue. |
| Stale native media events | A delayed event could change the new/paused track or recover a healthy source. | Native paused/ended/MediaError state is checked before event work. |
| Slow optional taste lookup | A usable successor waited behind the other artist request. | Each independent result publishes readiness as soon as it is usable. |
| Exhausted recommendations | Recently played session songs could return immediately. | A bounded session recent window excludes automatic repetitions; manual choices remain explicit. |
| Both search providers fail | Preview errors became a successful empty array; status vanished and the same query could not be retried. | Genuine empty and failed requests remain distinct; completed empty/failed queries are retryable, concurrent requests stay deduplicated. |
| Pagination finishes before the other provider | Late first-page refresh removed already appended songs after advancing the offset. | Native/preview page arrays retain fetched pages for every subsequent merge. |
| Search on Workers | Handlers expected nested context.waitUntil but Worker supplies top-level waitUntil, disabling successful edge cache writes. Canceled browser queries did not cancel origin work. | Both execution-context shapes work, provider requests inherit browser cancellation, failures are not cached, and response header X-Gnarly-Search-Cache identifies HIT/MISS. |
| Import a valid file without a MIME type | A second, incorrectly escaped extension filter rejected it. | The existing shared file validator is authoritative. IndexedDB and offline blob playback remain intact. |
| Unavailable origin or an abandoned audio request | Unbounded header waits and fallback could keep obsolete provider work running. | Shared 40-second header budget, request cancellation before and after headers, and no fallback burst on explicit restrictions/cooldowns. |
| Malformed range/MIME or cache promotion | Responses could be mislabeled as M4A; invalid ranges could reach extraction. | Range/length/MIME validation, cached 416 handling, bounded complete M4A promotion and first ftyp-box check. Browser audio still streams immediately. |

Relevant files: `app.js`, `lib/catalog.js`, `lib/listening-intelligence.js`, `lib/queue-audio-warmup.js`, `functions/api/{catalog,omnibox}.js`, `functions/fast-{audio,prepare}/[id].js`, `functions/_lib/origin-audio.js`, `wrangler.jsonc`, `sw.js`. The shell cache is `gnarly-web-shell-20261029-reliability-v9`.

## Repeatable validation

Run:

```sh
npm test
npm run build
npx --yes wrangler@latest deploy --dry-run
node tests/reliability.browser.mjs
node tests/queue-continuity.browser.mjs
```

The focused browser suites use original finite PCM WAV files, native HTMLAudioElement playback and controlled provider replies. They check actual playing/paused state, source clocks, source URLs, queue identities, IndexedDB persistence, offline playback, stale responses, same-query recovery, both pagination races, karaoke and MediaSession controls. They never start provider extractions. CI runs these alongside the existing integrity, Stage72, iPod/pause/menu and karaoke/export workflows and uploads evidence.

## Measurements and limits

The baseline queue harness reproduced seven failures among its original eleven scenarios. Passing the simple manual transition case alone did not reveal the empty-queue, stale-anchor, interrupted discovery and Previous defects. New tests exercise those conditions directly.

Six local manual/native-end transitions in the baseline measured p50 68.3 ms / p95 108.5 ms. During development, fixed runs measured p50 34.4–51.4 ms / p95 90.3–173.2 ms. These tiny fixture samples demonstrate native transitions continue to work; CPU/timing noise prevents claiming a speed improvement from them. They exclude provider, Render, real R2 and network latency and are not production TTFAP benchmarks.

Public read-only probes initially observed native search HTTP 503 after 7.55 seconds and origin requests with no headers within 18–25 seconds. A later origin playback-status request returned ready in 245 ms; native search returned 20 results. The Apple edge proxy returned 502 while the direct official Apple fallback worked; the browser still displayed 37 genuine native/preview results. This is a transient-availability observation, not proof of a permanent backend outage.

Render confirmed the existing NightcoreLab deployment is live at `7644b2a`, on a free service. Its documented idle spin-down/startup can add latency. Runtime logs also contain YouTube authentication/bot-check denials. Cache/offline playback and error recovery cannot guarantee a new full song when its provider refuses delivery. The patch respects those restrictions and cooldowns, keeps the failed recording selected and does not replace it silently with another recording or a preview.

Real production TTFAP distributions, buffering per listening hour, physical iPhone/Safari/Bluetooth behavior and sustained low-bandwidth sessions are not certified by these fixture runs. No production-like measurements are fabricated. No backend redeploy or operational-cost increase is part of this change.

Rollback is an ordinary revert of these frontend/edge commits; there is no data migration. Existing offline database/profile keys and downloaded files are preserved.
