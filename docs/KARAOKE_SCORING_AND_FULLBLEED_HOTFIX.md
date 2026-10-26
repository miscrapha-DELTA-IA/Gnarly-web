# Device hotfix — expanded karaoke points, black flashes and full-bleed covers

## User-reported regression
- Microphone permission works, but score sometimes stays at zero or restarts.
- Karaoke / background occasionally flashes black as cover imagery changes.
- Selecting album cover background started displaying a small centred thumbnail instead of filling the viewport (on low/unknown quality labels).

## Root causes
1. The stage's scoring clock advanced only on HTMLAudioElement `timeupdate`. Mobile Safari can deliver these sparsely and the scorer deliberately rejects >0.8s deltas (to prevent false points after stalls). Untimed/plain lyrics completely disabled scoring, even with an active microphone.
2. The stage assigned `img.src` twice — first the original (often remote low-res) and again the upgraded artwork after the quality lookup — exposing a decoded-image gap. Page album background also replaced `backgroundImage` immediately with an undecoded source and paused the visual layer before artwork loaded.
3. Recent low/unknown resolution CSS changed `background-size:cover` into an image constrained by `--gnarly-art-safe-width` (and karaoke wallpaper changed `object-fit` from `cover` to `contain`). That intentionally shrank the user's immersive album background, but it violates the approved UX.

## Implemented
- `KaraokeStage` scores on the live microphone analyser callback (~90ms), using **playback currentTime only**, never sample wall-clock. `timeupdate` stays as a harmless backup. No secondary player or microphone feedback is created. The original mic opt-in, zero-gain sink and recording isolation remain unchanged.
- `KaraokeLiveScore.startPresence` scores **verified microphone voice presence** while timed lyrics are unavailable; UI labels it `Presença vocal · sem sincronização`. Harmonicity plus RMS are required for breathy singing; background silence doesn't score. Pause/seek jumps do not generate points.
- When synced LRC becomes available, `retime` upgrades to line-timed scoring, **preserving earned points and combo**. No fake pitch references or precise word tracking without word-level data.
- Page album artwork and expanded-stage cover are swapped **after decode**; pending asynchronous requests are revision-guarded so an old song cannot overwrite a new one. Visible old artwork (or existing shader frame) remains until a replacement is valid. Closing stage cancels pending presentation.
- Restore `cover` on **all** image quality tiers in the viewport, player surface and karaoke wallpaper; quality selection remains based on real provider pixels. Low-res art may still be soft, but will never be boxed/shrunk again. No fake upscaling, new image proxies or GPU-heavy effects.
- Default GNARLY themes, all GNARLY 2 material/experience layers, audio, omnibox, smart queues, DJ, Stems and lyric typography stay untouched.

## QA
- `tests/karaoke-score-background-hotfix.test.mjs`: sustained sung score without LRC; pauses, silence, seeking and large jumps; late LRC preserves combo/score; retry on reopen; cover-size safeguards.
- Existing tests for 1280x720 pixel-verification, integrated karaoke and layout updated only where old assertions codified the undesirable tiny-cover regression.
- Stage72 mobile browser exercises computed styles on simulated low-quality metadata (full bleed in all three surfaces).
- Real iPhone Safari hardware recording and speaker/microphone interference still require physical validation. Headphones are recommended.
