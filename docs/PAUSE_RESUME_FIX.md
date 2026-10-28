# Pause/resume position regression

Baseline: main `3218519`, independently of the unmerged timeline/wheel feature.

Two application defects restarted otherwise healthy media on resume:

1. `prepareNativeAudio` compared absolute `audio.src` with relative `/fast-audio/...`. The comparison always differed on the Cloudflare host, so Play assigned the same source again and reset native currentTime.
2. Play treated `userPaused` as a new extraction/recovery session. This reset a working retry URL to attempt zero, and could also replace the source when a complete offline copy became available during listening.

The fix normalizes generated URLs before comparing them, resumes healthy attached media directly, and resets the bounded retry session only for a real error. A newly available offline file is used on a later selection, without replacing healthy media on resume. Pause continues to cancel speculative work and obsolete recovery. Canceled recovery operations also check their delivery generation, so a late provider status cannot overwrite the state after a quick Pause/Play. The existing audio element, queue, DSP, speed and controls remain authoritative. No backend or visual changes.

Reproduction with real native AAC in Chromium, using fixture responses under actual canonical edge/origin URLs:

| Sample | Paused position | Resumed position | Source writes / loadstarts |
| --- | ---: | ---: | --- |
| Before, cached edge | 43.061 s | 0.562 s | 1 → 2 / 1 → 2 |
| After, cached edge | 43.063 s | 43.065 s | 1 → 1 / 1 → 1 |
| After, recovered origin | 43.025 s | 43.025 s | unchanged |

Repeated normal controls, keyboard Space, MediaSession action callbacks, iPod Play/Pause and G, recovered origin retry URL, offline promotion and local offline playback and late canceled recovery responses are covered by `tests/pause-resume.browser.mjs`. Tests verify position, paused stability, source assignments, loadstart count, retry identity, 1.25× playback rate, a single audio element and no page errors. Calling preparation repeatedly with the same relative URL is also tested. MediaSession callbacks are simulated, not physical headphone tests. All media is original synthetic AAC; no provider requests are made. The app shader is frozen only in test hooks. Actual iPhone/Safari validation remains a device check.

Validation: 300 unit tests pass; Pages build passes. Run:

```sh
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium node tests/pause-resume.browser.mjs
```

The CI runs the new suite alongside existing Hardware Studio acceptance. Its inherited DPR assertion is aligned with the full-bleed cover behavior already established by main `cfbf5c7`/`284d856`; no artwork runtime behavior is changed. The unrelated Stage72 search-heading failure remains documented and untouched.
