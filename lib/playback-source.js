/** Mirrors the Stage 72 native GET /download?url=... contract.
 * Only the trusted first-party Render server is used. This does not obtain
 * a licence or circumvent provider access checks; the backend enforces its own limits.
 */
export const NATIVE_BACKEND = 'https://nightcorelab.onrender.com';
/** Only the two projects we control have the R2 binding. Local development,
 * other domains, Netlify and the iOS app retain the existing proven backend.
 */
export function isGnarlyPagesHost(host){
 return typeof host==='string'&&(
  /^(?:[a-z0-9-]+\.)?(?:gnarly-web-pages|gnarly-web-stage72)\.pages\.dev$/i.test(host)||
  /^gnarly-web\.miscrapha\.workers\.dev$/i.test(host));
}
export function fastPrepareURL(track){
 const id=youtubeID(track);
 if(!id)return null;
 if(isGnarlyPagesHost(globalThis.location?.hostname))
  return '/fast-prepare/'+id;
 return new URL('/prepare',NATIVE_BACKEND).href;
}

export function youtubeID(track) {
  const id = track?.videoId;
  return track?.source === 'youtube' && typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
export function trackAudioURL(track, {attempt = 0} = {}) {
  const id = youtubeID(track);
  if (!id) return null;
  // First party Pages Functions reads the private R2 bucket at the edge
  // and uses the progressive Render origin only on a cache miss. On a retry
  // bypass the edge to keep the existing resilient /download fallback.
  if (attempt === 0 && isGnarlyPagesHost(globalThis.location?.hostname))
    return '/fast-audio/' + encodeURIComponent(id);
  const url = new URL('/download', NATIVE_BACKEND);
  url.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`);
  // Same-origin to the audio backend: stream R2 hits through Render, never 302 to Safari.
  url.searchParams.set('delivery', 'browser');
  // Retry only the same canonical ID; a fresh browser request may reuse R2 server cache.
  if (Number.isInteger(attempt) && attempt >= 1 && attempt <= 2) url.searchParams.set('retry', String(attempt));
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
  if (mediaError?.code === 4 || error?.name === 'NotSupportedError') return 'O navegador não recebeu áudio reproduzível (código de mídia 4). A causa pode ser uma restrição do servidor, faixa indisponível ou formato incompatível.';
  if (error?.name === 'TimeoutError') return 'A música demorou para responder. Confira sua conexão e tente reproduzir novamente.';
  if (error?.name === 'AbortError') return 'O carregamento do áudio foi interrompido. Tente novamente.';
  return `Não foi possível reproduzir dentro do GNARLY${error?.name ? ` (${error.name})` : ''}. Tente novamente ou selecione outra música.`;
}
