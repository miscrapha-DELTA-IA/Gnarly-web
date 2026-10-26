# GNARLY Listening Intelligence — shared Omnibox memory & independent smart queues

## Audit

At original base `9c7845fdf6ce4464dd0513ab4e17a9c86e238bdf`, `radioQuery('artist')` and `radioQuery('mix')` both submitted the artist name; `chooseSmartTracks('mix')` still required the same exact artist/album. The one persistent `state.queue` retained **all** previous automatically generated tracks on every mode change, and the Omnibox displayed much of the same listening history again. Thus switching tabs/modes yielded the same recordings and queue order. Omnibox `record()` also counts selections, including selections before audio actually plays, so it is not a reliable training label.

## Upstream review

- [nauqh/resonance](https://github.com/nauqh/resonance): content-based similarity via playlist feature aggregation/KNN, an explicit listening-taste profile, database and API separation. **GPL-3.0** repository. Learn the ideas, **do not copy any source code, model weights or assets** into GNARLY.
- [sudsali/MusicRecommendationSystem](https://github.com/sudsali/MusicRecommendationSystem): user similarity and collaborative filtering through Apache Spark/ALS plus React/FastAPI. Depends on a real multi-user ratings matrix and potentially sensitive user profiles. Not suitable for a single-device anonymous streaming app with no such dataset; no code imported or users tracked.
- GNARLY's own strict source-safe `chooseSmartTracks` and transactional `commitPlaying` remain available, with no new Python services, AI tokens, copyrighted datasets or playback endpoints.

## Implemented: shared, privacy-first taste memory

`lib/listening-intelligence.js` stores bounded events locally in `gnarly.listening-intelligence.v1` with a 75-day age limit (180 events, 110 displayed recommendation exposures). Signals are added only when:

- The existing real `HTMLAudioElement` enters `playing` for a new selection (not when the user taps a row, not on repeated pause/resume).
- Playback `ended` confirms completion.
- The user actively favorites or unfavorites a recording.
- The user explicitly presses Next early in a playback (short skip).

The signals have distinct positive/negative weights, recent-event time decay, artist and album affinities, favorites, recent completed listens, skips and recommended exposure penalties. This is **heuristic content-based personalization**, not an offline trained collaborative model or an unsupported ML inference. All data stays on this browser origin; no identifying user ID, raw microphone/audio samples, listening telemetry or third-party analytics is sent.

`storage` events refresh memory across separate tabs **on the same web origin**. Distinct domains, devices, cleared browser storage or private sessions cannot share the memory without an authorized sync backend. An explicit **Reiniciar aprendizado** button resets only the learned signals, not saved playlists or favorites.

## Independent queue behavior

- **Manual** leaves explicitly added items untouched.
- **Artista** uses only verified recordings credited to the selected artist (plus dedupe, skip and recency filters).
- **Álbum** requires the verified exact artist **and** album; no cross-album/cross-artist leaks.
- **Mix** alternates artist/album, with one bounded secondary catalog query to the most positively learned different artist (when one exists). Unknown artists are never inferred.
- **Playlist** follows its saved order. The selected playlist isn't copied into other modes.
- Each automated suggestion is tagged `_gnarlyAutoMode`. Switching modes clears only tagged suggestions; manually queued tracks retain their original positions. Adding a recommended track manually promotes it to an untagged/pinned item. No auto queue is persisted into playlist definitions.
- Playlist switching removes the prior playlist's auto-suggested items; manually selected items stay.
- Explicit **Completar fila** can rotate recommendations instead of repeating the previous deterministic seed; recently exposed/played songs are deprioritized for 48h, with graceful reuse when catalogs contain only a few valid tracks.
- `sameRecording` detects matching artist/title and closely matching durations even when the video or provider ID differs. Live, remix, extended and different-duration versions are allowed when distinct. Playback source metadata, selected URL, track duration, no-duplication transactional policy, audio graph and recovery unchanged.

## Omnibox

- Empty search: **Para você** proposes verified known playable recordings from shared history/favorites, excluding current song and queued recordings and spreading suggestions between artists.
- Explicit text or pasted link: relevance and recognized exact item remain authoritative. Taste **never replaces or hides an explicit search match**.
- The library stays local/offline plus saved favorites; queue stays next tracks; karaoke stays lyrics. Their purpose is separate while preferences connect the recommendation ranking.

## Verification

`npm test` covers memory lifecycle/limits/privacy, artist/album/mix disjoint identity constraints, liked related artists, forced-refresh rotation, exclusion of recent exposes, manual queue retention, cross-provider deduplication and no autoplay recording of intent. Existing queue, karaoke, playback, WebGL and quick creative controls must all remain intact.

Known limitation: single-device memory is neither a Spotify/KNN vector embedding nor collaborative intelligence, and mode identity restrictions can produce a shorter list rather than deliberately queueing unrelated songs. Catalog backend results must supply trustworthy album/artist fields for the strict Artist/Album modes.
