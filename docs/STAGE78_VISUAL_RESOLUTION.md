# Stage 78 — full-viewport desktop + crisp adaptive GPU

- Layout: wide screens with fine pointer run a genuinely full-browser visual canvas; mobile/tablet retain existing proportions. Player sits centered with content-proportional width. Panels float on the right.
- Native WebGL2 target: actual device pixel ratio, max 3 DPR, bounded by hardware max renderbuffer and adaptive 8.3-megapixel desktop / 5-megapixel mobile budgets. Never render a fixed blurry 2.1-megapixel background.
- Governor: assess 80 rendered frames, require two bad windows before downshifting 12% and five good windows to restore 8%; minimum scale 65%; eight-second cooldown. No rapid oscillation on one missed frame.
- Resize: only change canvas backing dimensions when geometry or quality changes; preserve programs and GPU resources. CSS always spans viewport.
- CPU fallback: reusable ImageData frame and approximately 950k budget to avoid O(width*height) per-frame allocation; no false claim of native shader parity when WebGL2 unavailable.
- Artwork: prefer 1600px internal Apple artwork and 2000px album-mode background, with provider original retained on known Apple load failure.
- QA: 320–430 mobile, 768 tablet, 1440 and 1920 desktop; test viewport fill, DPR, resizing, look selection, and material-specific GPU hashes. Frame pacing on a physical desktop/iPhone remains environment-dependent.
