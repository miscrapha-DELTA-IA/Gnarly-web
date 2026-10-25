# GNARLY WEB — Private Stage 72 Audio Bridge (α4)

This is an **opt-in beta** using the existing `NightcoreLab` FastAPI `GET /download?url=...` backend implementation. The web UI uses `GET /api/omnibox` for search metadata; those search results are distinct from the audio endpoint.

## Architecture

1. The web browser uses the current Omnibox and Stage 72 ranking. `youtube:<videoID>` is only a canonical **ID**, never an arbitrary fetch URL.
2. Browser `GET /api/beta-access` learns only `enabled, authenticated`. A tester enters the invite code once in the GNARLY UI.
3. Netlify validates the code against `GNARLY_BETA_ACCESS_CODE` and sets a 7-day `HttpOnly; Secure; SameSite=Lax; Path=/api` cookie signed with HMAC SHA-256. Secrets are **never sent to the frontend**.
4. Browser `<audio crossorigin=anonymous>` loads `GET /api/beta-audio?id=VIDEO_ID` on the **same origin**. The gateway enforces an authenticated cookie, fixed ID grammar, HTTPS backend, response content type, max stream length and byte-range forwarding.
5. Only the Netlify server calls the existing backend `/download?url=https://www.youtube.com/watch?v=...` implemented with `yt-dlp`. No new public extraction endpoint or API secret is embedded in browser JavaScript. HTTP 200/206 audio is streamed (not buffered); a `206` and `Range` headers allow seeking when supported by the backend.
6. HTMLAudioElement + Web Audio gets the **same audio graph** as imported local files, powering Nightcore, Slowed, Reverb, bass, lyrics and visual reactivity. The **official visible YouTube player** remains the fallback.

## Opt-in deployment — required environment variables in Netlify

Set variables in **Site configuration → Environment variables**, scoped to Functions, and redeploy:

```
GNARLY_ENABLE_TEST_AUDIO=true
GNARLY_BACKEND_URL=https://nightcorelab.onrender.com
GNARLY_BETA_ACCESS_CODE=<unique non-obvious invite code with at least 12 characters>
GNARLY_BETA_SESSION_SECRET=<independent cryptographically random secret with at least 32 characters>
```

Generate independent values on your own computer using: `python -c "import secrets; print(secrets.token_urlsafe(24)); print(secrets.token_urlsafe(48))"`. Use the first as `GNARLY_BETA_ACCESS_CODE` and the second as `GNARLY_BETA_SESSION_SECRET`. Share **only the invite code**, privately, with authorized testers. Never share the session secret. If the env variables are unset, too short or disabled, the web page continues to use the **official YouTube player**; this is the safe default. A deployment being online does **not** mean the beta audio is activated.

To disable the beta immediately, set `GNARLY_ENABLE_TEST_AUDIO=false` and redeploy; to revoke previous sessions, rotate `GNARLY_BETA_SESSION_SECRET` and redeploy.

### Security and operability

- This access code is **not individual identity verification**, not an entitlement or license, and not a substitute for a content-rights check. Distribute only to a small group with music you have rights to process. Avoid publishing your PIN, tokens, or cookies.
- The existing Render backend itself remains reachable independently of this gateway; the private gate is **specific to the web app** and does not retroactively secure other endpoints. Protect the backend separately if exposing this feature more broadly. A rate limiter backed by a shared store and server-side per-track authorization should be added before scaling.
- Netlify imposes an immutable **20 MB streamed response** and a runtime execution limit. We cap to 19 MB for overhead; very long audio or a cold/slow `yt-dlp` request can return 413, 502 or 504. Netlify Functions is a temporary bridge, not the final high-volume streaming architecture.
- Backend `FileResponse` supports byte ranges, but requests can still consume Render CPU and bandwidth. The native backend has a concurrent-download gate, cache bounds and max duration. No extraction runs on Netlify.
- **Do not rely on `yt-dlp` extracting material for which you do not have permission**: platform terms and content rights still apply even for a private invite or personal DAW use.
- Browser/Safari autoplay is constrained. After entering the invite code, the tester may need to tap Play once again.

## Validation gates

- `npm test`: cookie signature, expiry, authorization, fixed video ID/URL, byte range forwarding, response cap, music presets and lyrics.
- Browser UX: test code entry, authorized playback, seek/range, Nightcore/Slowed/Reverb with permitted song, repeat playback, next track and automatic lyrics on a real iPhone Safari.
- Verify Netlify functions logs for 502/504, Render health and cache; **do not claim a successful full-track smoke test until actually demonstrated on a permitted track**.

Sources: `NightcoreLab/backend/main.py` Stage 72, Netlify Functions streamed Response limits, and Starlette FileResponse range support. The website remains a separate repository and no Swift or backend code was changed.
