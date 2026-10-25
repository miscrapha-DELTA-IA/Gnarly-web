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
  // Same-origin to the audio backend: stream R2 hits through Render, never 302 to Safari.
  url.searchParams.set('delivery', 'browser');
  return url.href;
}
export function selectMusicResults(songs, previews) {
  // Full-catalog song metadata is the primary source in the native Omnibox.
  // A preview is not a replacement for a playable song.
  const valid = songs.filter(song => !!youtubeID(song));
  return valid.length ? valid : previews;
}

/** Browser media failures do not expose their underlying HTTP status.
 * Do not claim a specific HTTP code from a MediaError code.
 */
export function playbackFailureMessage(error, mediaError) {
  if (error?.name === 'NotAllowedError') return 'O Safari bloqueou a reprodução automática. Toque Play novamente para autorizar o áudio.';
  if (mediaError?.code === 2) return 'Erro de rede ao carregar o áudio (código de mídia 2). Confira sua conexão e tente novamente.';
  if (mediaError?.code === 3) return 'O navegador não conseguiu decodificar o áudio (código de mídia 3).';
  if (mediaError?.code === 4 || error?.name === 'NotSupportedError') return 'O navegador não recebeu áudio válido do servidor (código de mídia 4). Pode ser 403/422, fonte indisponível ou formato incompatível.';
  if (error?.name === 'AbortError') return 'O carregamento do áudio foi interrompido. Tente novamente.';
  return `Não foi possível reproduzir dentro do GNARLY${error?.name ? ` (${error.name})` : ''}. Tente novamente ou selecione outra música.`;
}
