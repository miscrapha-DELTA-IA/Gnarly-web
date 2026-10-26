# GNARLY Web — Layer 1 palette, Layer 2 experience, Aa lyric typography

## Topbar controls

- **🎨 Palette**: opens `sheet='theme'`, with Classic, GNARLY Material and special GNARLY theme choices. Only `state.theme` changes. GNARLY's legacy override still operates while chosen and **does not overwrite the saved experience**; this caveat is clearly labeled.
- **⚡ Lightning**: opens `sheet='experience'` for classic and GNARLY texture/motion experiences. Only `state.experience` changes. Palette is preserved.
- **Aa**: opens `sheet='lyric-style'` for typography. Only `state.lyricStyle` changes. It applies to the floating lyric HUD and karaoke sheet, and persists in `gnarly.web.lyricStyle` local storage.

The third existing **visual rhythm** (`state.reaction`) remains a separate screen via **Mais → Ritmo visual**. Audio playback, queue, DJ, MIDI, shaders, artwork and synchronized LRC are unchanged.

## Initial built-in Aa presets

Original, Neon, Revista, Digital, Kinetic and Minimal, backed by CSS system font stacks. There are **no bundled third-party font binaries** and no remote font network fetch. Changing a style updates CSS properties; text/time references are unchanged. `prefers-reduced-motion` is respected.

## Later font repository/dataset integration

`lib/lyric-style.js` exposes `registerLyricStyle` and `resolveLyricStyle`, accepting validated, declarative manifests with:

```json
{
  "id":"future-serif",
  "name":"Nova Revista",
  "description":"Licenced editorial type",
  "family":"editorial",
  "weight":700,
  "size":1.05,
  "tracking":0.01,
  "transform":"none",
  "treatment":"editorial"
}
```

New fonts should be licensed and provenance-confirmed **before** bundling or hosting them. The `family` token maps to a curated local font-family alias, so arbitrary CSS/URLs cannot be injected through dataset metadata. Additional families can be registered in code after an asset audit. Fonts in images, datasets or prompts alone do not become installable font binaries. Never serve unreviewed remote CSS or bypass licenses.

## QA

- iPhone Safari 320/375/430 CSS safe area and all eight header actions (Eye, Palette, Bolt, Aa, Photo, Music, Share, Record)
- Palette must not modify stored Experience; Bolt must not modify Theme; Aa must not modify theme, experience, reaction, LRC timing, or playback.
- Persist across reload, select no-lyrics state, switch songs, open karaoke and verify visual styling remains consistent.
- Existing CI tests, Cloudflare Pages build and Playwright Stage72 browser suite.
