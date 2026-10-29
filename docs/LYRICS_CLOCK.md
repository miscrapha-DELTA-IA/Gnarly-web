# Compact lyrics continuity

The compact HUD previously displayed plainLyrics[0] for the whole song when a provider returned text without timestamps. This looked like a synchronized lyric frozen on its first phrase. An exact LRCLIB plain-text match also prevented searching for a compatible synchronized alternative.

The lookup now searches for a validated synchronized alternative when the exact match has only plain text. A failed extra lookup preserves the known plain lyrics. If timestamps remain unavailable, the HUD explicitly offers the unsynchronized karaoke reader instead of pretending the first phrase is live. The full plain text remains in karaoke; no timing is fabricated.

The compact render guard now includes text and style rather than only the numeric line index. Native seeked events update the HUD immediately. A delayed manual LRC import cannot overwrite another selected recording, and successful manual import clears the loading state.

Validation: 364 unit tests, production build and native Chromium browser coverage for real finite audio progression, forward/back seeking, pause, same-index lyric replacement, plain-text status and delayed import across track selection. The browser suite runs in iPod Hardware acceptance. Physical iPhone/Safari remains a device check. Audio transport, effects and visual design are preserved.
