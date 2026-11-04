# GNARLY Adaptive Library — personal cache planning

## Scope

GNARLY now learns daily **distinct** listened recordings per browser and
maintains roughly 68.75% stable and 31.25% rotating prioritized positions.
For someone who plays 80 distinct songs per active day, the initial capacity
is around 100 positions; this does NOT download 100 files immediately. The
capacity is bounded between 24 and 160 positions and reflects a 14-day P75.

### Separation of responsibilities

- Personal ranking is stored locally in the browser by
  lib/adaptive-library.js, separate from Omnibox and current Mix. The index
  contains short public metadata, exact recording IDs, preference counters,
  daily distinct counts and the sticky core list. No account identifiers,
  raw audio, bearer tokens, private URLs or server listening-history uploads.
- Physical media in R2/Guardian/Google Drive remains shared and deduplicated.
  Hundreds of personal profiles can refer to the same exact object.
- Device downloads are stored in existing IndexedDB. An automatically
  cached track has adaptive=true; explicit user downloads and imported files
  remain protected (adaptive=false).
- The adaptive planner does not change the selected track, queue, player,
  current source, audio effects, extraction or Guardian pacing.

### Scoring

A real HTMLAudioElement playing event counts one distinct recording per day,
regardless of repeated plays. Completion, favorites, playlist membership,
listening frequency and recency improve a track's score; recent skips lower
it. Recency decays continuously, and previous core members receive a small
bonus to prevent unnecessary churn. Only exact 11-character recording IDs
are auto-managed. Local user-owned files are not included in the remote
cache planner. The model keeps at most 900 tracks and 35 daily buckets.

### Optional automatic offline cache

In the GNARLY Library sheet, the user can turn on personal pre-cache. It
is OFF by default. The system only considers tracks already marked
playbackAvailability=r2, and downloads with cacheOnly=true. A cache miss
returns unavailable without causing /prepare, new extraction or provider
traffic. The system inherits the two-per-session next-song pre-cache budget.

A download can start only during stable ongoing native playback, with at
least 25 seconds buffered, a visible tab, sufficient estimated free quota,
an adequate network connection, no data saver and no provider cooldown.
Complete HTTP 200 media are validated before saving. Failed/partial
downloads never poison the IndexedDB cache.

Adaptive files can be trimmed only after successful new auto cache: a copy
older than three days, not in the current priority plan, and not currently
selected, manually queued or favorited, can be removed once the auto-managed
capacity budget is exceeded. User imports and explicit downloads are never
automatically removed. No R2 or Drive objects are deleted.

### Known limits

A personal browser install is not an authenticated server account. Users
on different devices are not synchronized, and browser storage can be
evicted by Safari/Chrome or cleared by the user. A high score does not
guarantee a song is online, on R2 or already downloaded. First-play
extraction remains the Guardian's fallback when needed, not an adaptive
background action. Browser device storage and cloud shared storage are
distinct.

## Verification

- node --test tests/adaptive-library.test.mjs
- npm test
- npm run build:pages

After merge, manually test a cached song and a new song while watching TDR
and the Guardian log. Verify adaptive cache never requests a new /prepare,
the existing player remains uninterrupted, and stored offline files work
after a reload. Do not raise prefetch budgets until real TDR evidence
supports doing so.
