# GNARLY Web — Media Session, headset and background (iOS Stage 72 parity)

## One authoritative player
The same `<audio id="player-audio">` plays all catalog/local tracks. `WebAudioEngine` retains its single `MediaElementAudioSourceNode` for Nightcore, Slowed, EQ and material reactions. No duplicated, muted or hidden second players, silent media loops, service workers playing audio or duplicated queues.

The browser's `MediaSession` relay (in `lib/media-session-controller.js`) takes the place of iOS `MPNowPlayingInfoCenter` and `MPRemoteCommandCenter` where browser/platform support exists. The `app.js` closures dispatch to the **existing** `play()`, `pause()`, `next()`, `previous()` and the current `audio.currentTime`.

| Control | Action |
| --- | --- |
| Lock screen / headset Play | `play()` if paused |
| Lock screen / headset Pause | `pause()` |
| Play/Pause headset single-button | OS delivers `play` or `pause`; hardware MediaPlayPause key is a fallback |
| Headset double press / Next | `next()` **only** when queue nonempty |
| Headset triple press / Previous | Restart current song when over 3 s, else return to prior session track |
| System progress drag | `seekto` (guarded and bounded by duration) |
| Seek buttons (supported browser) | ±10 s or supported `seekOffset` |
| Stop | `pause()` + rewind |

The player publishes real title/artist/album/artwork, duration, original-song elapsed time, live playback rate, and playing/paused status. The source playback rate is not applied twice: DOM `audio.playbackRate` is authoritative. The progress sync rate is bounded at around 1 s; seek, rate, track and pause events publish immediately.

## Safari / Home Screen app
On user-initiated play, feature-detect `navigator.audioSession` and request `type='playback'` **before** creating/resuming Web Audio. The opt-in karaoke microphone requests `play-and-record`, restoring `playback` on stop. These values improve eligibility for background playback in supported WebKit builds, but browsers may still suspend an `AudioContext`, kill a tab, interrupt on phone calls or restrict next-track autoplay for a standalone PWA. JavaScript cannot enable native iOS background entitlements.

Do **not** auto-resume on headset unplug, browser visibility or interruptions; let the user/OS initiate resumption. Visual shaders and scoring can stop when page becomes hidden; music playback and the Media Session are never intentionally paused on `visibilitychange`.

## Manual device checklist
1. In Safari on iOS, start a catalog song (real media) and verify lock screen / Control Center metadata.
2. Lock the device, verify it plays continuously. Test play/pause and queued next/previous using lock screen, wired headset and Bluetooth earbuds.
3. In Nightcore 1.25×, verify elapsed position advances at the correct playback rate; seek from Control Center.
4. Unplug headphones: ensure no unexpected forced resume through speakers.
5. Bring GNARLY back to foreground: same song, position, speed and queue; audio remains responsive.
6. Repeat from standalone Add to Home Screen mode. Record browser/iOS build; some WebKit versions limit background Media Session controls and PWA next-track autoplay.
7. Test karaoke mic: audio continues through explicit mic capture, and returning to music restores playback category.
8. Repeat a local music file and verify command behavior without server requests.

CI covers the pure relay/state transitions, but **hardware behavior must be measured on real iPhone and headset**; a headless Chromium test cannot prove iOS system-level persistence.
