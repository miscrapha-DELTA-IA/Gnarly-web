# Omnibox Stage 72 → Web (α5)

Source: `NightcoreLab/Sources/OmniboxEngine.swift`, `SearchSession.swift`, `YouTubeSearchService.swift`, `AudioDownloadManager.swift` and `backend/main.py`.

1. UI sends a text query through `GET /api/omnibox?term=...` (Netlify metadata proxy); the source is native `GET /search?query=...` NDJSON. Local history, cached search, ranking and queue remain in the browser.
2. Search prioritizes valid YouTube Music song IDs returned by the native backend. iTunes 30-second previews are kept solely as fallback *when music search returns no songs*, and remain labeled as previews. For direct links, the canonical 11-char ID is preserved.
3. Only when a user presses Play does the HTMLAudioElement request `https://nightcorelab.onrender.com/download?url=https%3A...`. This is the same backend response used by the Swift iOS app, not an iframe; it is an M4A response that may be played through a Web Audio graph.
4. Render FastAPI `main` enables a narrow CORS origin for `https://gnarlyweb.netlify.app`. CORS is not an access control system; the backend's separate `AccessControl`, extraction queue, download validation, cache and resource controls remain in effect.
5. The old Netlify invitation/audio proxy was removed from the web app in α5. User login is not requested by web playback. Fallback to YouTube is explicit via the Music controls, never automatic. Error text is displayed inline if Render or YouTube extraction rejects audio.
6. Web Audio applies Nightcore, Slowed, Reverb and bass to any compatible playable HTMLAudio source. Exact AVAudioEngine pitch-shift, sample-accurate clocks, Metal visuals, stems and complete karaoke remain future parity tasks.

**Not yet verified:** real-device iOS Safari and full extraction of a permitted live musical track. Local Chromium smoke injects a synthetic short audio response and proves Play dispatch, timeline and effects; it does not test YouTube availability. Never expose `GNARLY_ACCESS_TOKENS`, server cookies, or other backend secrets in the browser. Audio must be obtained and transformed with applicable permissions.
