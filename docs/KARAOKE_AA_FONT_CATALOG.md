# GNARLY Aa — Karaoke Typography Library (Stage 81)

## Product contract
Aa opens the existing lyric-style sheet (the same topbar button introduced by PR #23).
**One tap on a typeface instantly updates the floating lyric HUD and karaoke lyrics list.**
Selection only updates CSS custom properties, so the sound source, song ID, queue,
AudioContext, beat/stems processing, LRC text, timestamps and scoring are untouched.
No extra WebGL animation or TypeIt cursor is added to the render loop.

### 40 total choices
The six original browser-only presets are preserved: Original, Neon, Revista,
Digital, Kinetic and Minimal.

34 curated open-source Google Fonts families, organized into six categories:

- **Clean (9)**: Inter, DM Sans, Space Grotesk, Manrope, Outfit, Work Sans, Plus Jakarta Sans, Lexend, Nunito Sans.
- **Experimental (6)**: Bricolage Grotesque, Unbounded, Syne, Chakra Petch, Orbitron, Righteous.
- **Poster (7)**: Archivo Black, Bebas Neue, Oswald, Anton, Teko, Barlow Condensed, Rajdhani.
- **Digital/Mono (3)**: Space Mono, IBM Plex Mono, JetBrains Mono.
- **Editorial (5)**: Playfair Display, Instrument Serif, Fraunces, Cormorant Garamond, EB Garamond, Lora.
- **Manuscrito (3)**: Caveat, Permanent Marker, Dancing Script.

Note: Category counts are not an API contract; the manifest in `lib/lyric-font-catalog.js` is authoritative.

## Behaviour
- **Quick visual selection**: tap a font card to apply instantly while the track keeps playing; no Apply button, no stopping karaoke and no timestamp regeneration.
- **Manual scope**: “Esta música” remembers the font for one known song ID; “Este artista” uses a verified artist credit (never YouTube/unknown artist), “Todas as músicas” updates the global default.
- **Precedence**: explicit song override > explicit artist override > global default. No AI genre/style guessing.
- **Reuse**: the matching saved preference reappears when returning to the song. Max 128 keyed songs and 128 artists to avoid unlimited localStorage growth.
- **Search/filter**: 40 catalog entries, live text filtering and chips Clean/Experimental/Poster/Digital/Editorial/Manuscrito.
- **Immediate fallback**: switching sets local CSS font stack synchronously, then loads selected Google Fonts CSS asynchronously with `display=swap`; selected card previews close to viewport are lazy-loaded using IntersectionObserver. This avoids downloading 34 font files at startup.
- **Readability**: balanced wrapping, responsive font sizes, contrast/shadows inherited from GNARLY and support for prefers-reduced-motion. No forced per-character animations (fragile for accented words/long languages).

## Repository review (not all are font families!)
| Reference | License / type | Decision |
|---|---|---|
| [Are.na open source typefaces](https://www.are.na/frederic-brodbeck/open-source-typefaces) | Curatorial collection, individual fonts require their own licenses | Design reference only; actual downloadable contents could not be independently enumerated |
| [Beautiful Web Type](https://github.com/ubuwaits/beautiful-web-type) | MIT collection/guide | Readability and aesthetic shortlist; font assets separately licensed |
| [Gutenberg](https://github.com/matejlatin/Gutenberg) | Typography CSS toolkit, repo license requires independent verification | Design inspiration; no dependency |
| [Blotter](https://github.com/bradley/Blotter) | WebGL text effects, license must be independently verified | Rejected for runtime due to extra shader/texture allocations |
| [TypeIt](https://github.com/alexmacarthur/typeit) | GPL-3.0 typing-effect library | Not embedded; could alter lyric timing and introduces copyleft obligation |
| [React Native Typography](https://github.com/hectahertz/react-native-typography) | MIT, RN styles | Design analogy only; no React Native runtime in web |
| [Scroll Craft](https://github.com/nateherkai/scroll-craft) | MIT, scroll animation agent skill | Not appropriate for audio-time-sync karaoke |
| [React Wrap Balancer](https://github.com/shuding/react-wrap-balancer) | MIT, React utility | Native CSS `text-wrap: balance` rather than React hydration |
| [Theme UI](https://github.com/system-ui/theme-ui) | MIT React theming | CSS variables + built-in style registry, not React dependency |
| [Nerd Fonts](https://github.com/ryanoasis/nerd-fonts) | Heterogeneous patched icon-font collection | Excluded for lyrics, avoids huge weight and license complexity |
| [Awesome Fonts](https://github.com/brabadu/awesome-fonts) | Curated list | Discovery only; no redistributable font binaries implied |

## License, hosting and privacy
- We **do not commit or redistribute font binaries**. Families are reviewed
  against [Google Fonts](https://fonts.google.com) open-source catalog; license
  details vary (usually SIL OFL 1.1). The Google CSS API serves the selected
  public font. The names and CSS URL are strictly allowlisted.
- When a user selects a catalog font, the browser requests CSS/woff2 from
  Google Fonts, potentially exposing the user's IP address to that provider.
  System-style presets make no external network requests.
- The font download may fail offline; typography still changes to the defined
  fallback immediately. Add self-hosted licensed woff2 only after preserving
  license and attribution requirements and measuring memory/cache performance.
- The 6 built-in styles and browser-safe defaults remain available indefinitely.

## QA
- `node --test tests/lyric-style.test.mjs tests/karaoke-font-library.test.mjs`
- `npm test`; `npm run build:pages` (no font binaries in Cloudflare package).
- Playwright Stage72: select Aa, ensure 40 options, filter/search, single-tap
  update, unchanged selected theme, manual scope without a blocking Apply.
- iOS Safari: font swap during live LRC timeline, accent glyphs
  (á é í ó ú ã õ ç), long lines, low-memory device, 320/375/430px widths.
- No guarantee every remote font family supports every script: browser fonts fallback per glyph.
