/** Mirrors the Stage 72 native GET /download?url=... contract.
 * Only the trusted first-party Render server is used. This does not obtain
 * a licence or circumvent provider access checks; the backend enforces its own limits.
 */
export const NATIVE_BACKEND = 'https://nightcorelab.onrender.com';
export function youtubeID(track) {
  const id = track?.videoId;
  return track?.source === 'youtube' && typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
export function trackAudioURL(track) {
  const id = youtubeID(track);
  if (!id) return null;
  const url = new URL('/download', NATIVE_BACKEND);
  url.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`);
  return url.href;
}
export function selectMusicResults(songs, previews) {
  // Full-catalog song metadata is the primary source in the native Omnibox.
  // A preview is not a replacement for a playable song.
  const valid = songs.filter(song => !!youtubeID(song));
  return valid.length ? valid : previews;
}
