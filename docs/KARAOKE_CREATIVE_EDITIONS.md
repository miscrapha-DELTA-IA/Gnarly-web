# GNARLY Aa Creative Editions — Magazine-grade karaoke art direction

## Why this replaces a fonts-only picker
A font family is a *material*, not a complete visual composition. The earlier
Aa library contained 6 native CSS presets + 34 Google Fonts families (40);
they are preserved as **Classic fonts** for users who prefer simple text.

This stage adds **40 actual visual composition programs**: 20 art/kinetic,
20 premium/studio. They are pure declarative DOM and CSS and can be switched
immediately while playback continues. Total exposed selection: **80 options**.

## 20 Experimental / Kinetic
1. Magazine Cutout — deterministic per-word magazine paper, 4 palettes,
   4 contrasting font stacks, slight offsets, staggered paper entrance.
2. Xerox Ransom — photocopy shadow, split collage, scan jitter.
3. Neon Stencil — cut stencil edges, oppositional dark/luminous tiles.
4. Chrome Surge — reflective gradient typography with subtle light pulse.
5. Glitch Zine — RGB misregistration and xerographic text displacement.
6. Type Tornado — editorial tilt and elastic headline landings.
7. Prism Split — chromatic refracted shadow typography.
8. Digital Havoc — scanlined terminal tiles.
9. Spray Tag — marker strokes and hand-drawn underline.
10. Liquid Type — translucent fluid surfaces with bounded shape morphing.
11. Tape Collage — tape/labels in alternate off-white/cyan tones.
12. Ransom Spectrum — alternate colored paper strips with bounce.
13. Electric Ticket — perforated fluorescent ticket lettering.
14. Halftone Punch — dot-screen print behind aggressive display type.
15. Y2K Warp — pink/violet warped, layered futurist posters.
16. Barcode Beats — striped black/white code textures.
17. Elastic Words — rounded acidic lettering with squash/bounce.
18. Kinetic Masthead — high-contrast moving masthead newspaper geometry.
19. Paper Trail — aging stock overprints and multi-sheet stamps.
20. Stereo Echo — cyan/pink parallax shadow voice echoes.

**Determinism:** `lyricWordHash(lineId,wordIndex,wordText)` seeds consistent
per-word rotation, paper/background, serif/mono/display faces and timing
stagger, inspired by iOS `MagazineCutoutStyle.swift`. No random values per frame.

## 20 Premium / Studio
Vogue Editorial, Swiss Grid, Brutalist Index, Typographic Atlas,
Midnight Serif, Monochrome Folio, Acid Broadsheet, Art Deco Cinema,
Cyanotype, Hot Metal, Fashion Caption, Analog Contact,
Cyber Monogram, Archival Stamp, Brutalist Italic, Liquid Chrome,
Velvet Noir, Ultra Minimal, Neon Serif, Concrete Poster.

These are full-line typography treatments: hierarchy, premium serif/display
pairing, outline, frame/rule, ink colors, materials, shadows and scale.
They favor uninterrupted readability over kinetic interruption.

## Runtime contracts
- Only **the active lyric line** receives expanded word-level markup. Inactive
  lines remain plain text. One chosen gallery specimen may animate; the other
  79 remain static, preventing 40 simultaneous animation loops.
- 26-word / 210-character caps for expanded per-word treatment; beyond that,
  fall back to clear single-line styling.
- Word and attribute text is HTML-escaped; no remote JS, user-authored CSS,
  font binaries, WebGL text engine, or word alignment is added.
- A visual update restyles the HUD and karaoke sheet immediately with no
  changes to LRC timestamps, pause/play, queue, voice scoring or download.
- Reduced-motion system preferences disable typography animations.
- Legacy 40 presets and scoped preferences (song > artist > global) are kept;
  selecting a creative style saves its stable ID.
- Underlying Google Font from an allowlist loads only on demand; fallbacks
  are intentionally legible and immediate.

## QA
- CI validates 20 kinetic + 20 premium unique registry entries and CSS selectors;
  deterministic escaped markup, 80 total incl. classics, long text fallback,
  reduce-motion CSS, and Stage72 browser validation.
- Device validation recommended on iPhone Safari with Portuguese diacritics,
  RTL/CJK texts, large type settings, normal/low power, 320/375/430px viewport.
  CSS provides fallback glyphs when an optional font lacks a character.

## Why not a second engine?
The app already runs high-resolution visual shaders and audio effects. A
per-glyph GPU renderer, TypeIt/Blotter engine or additional AudioContext would
compete for frames, drain battery and complicate karaoke synchronization.
These compositions are GPU-friendly CSS on bounded DOM with existing timestamps.
