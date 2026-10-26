/**
 * GNARLY browser playback resilience. This module only retries the exact
 * canonical YouTube ID already selected by the Omnibox. It never selects a
 * different recording, exposes credentials or bypasses a provider restriction.
 */
import {youtubeID,NATIVE_BACKEND} from './playback-source.js';

export function retryableMediaFailure(error, mediaError) {
  if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') return false;
  return mediaError?.code === 2 || mediaError?.code === 4 || error?.name === 'NotSupportedError';
}

export class AudioDeliveryRecovery {
  constructor({delays = [450, 1200], wait = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
    this.delays = delays;
    this.wait = wait;
    this.generation = 0;
    this.selected = null;
    this.videoId = null;
    this.attempt = 0;
    this.pending = null;
  }
  select(track) {
    this.cancel();
    this.selected = track;
    this.videoId = youtubeID(track);
    this.attempt = 0;
  }
  cancel() {
    this.generation++;
    this.pending = null;
  }
  isSelected(track) {
    return track === this.selected && !!this.videoId && this.videoId === youtubeID(track);
  }
  retry({track, error, mediaError, isCurrent, restart, onRetry}) {
    if (!this.isSelected(track) || !retryableMediaFailure(error, mediaError)) return Promise.resolve(false);
    if (this.pending) return this.pending;
    const generation = this.generation;
    const job = (async () => {
      while (this.attempt < this.delays.length) {
        const attempt = ++this.attempt;
        onRetry?.(attempt, this.delays.length);
        await this.wait(this.delays[attempt - 1]);
        if (generation !== this.generation || !this.isSelected(track) || !isCurrent()) return false;
        try {
          const ok = await restart(attempt);
          if (generation !== this.generation || !this.isSelected(track) || !isCurrent()) return false;
          if (ok) return true;
        } catch (failure) {
          // A gesture or codec restriction cannot be solved by repeat requests.
          if (failure?.name === 'NotAllowedError' || failure?.name === 'AbortError' || failure?.name === 'UpstreamRateLimitedError') return false;
        }
      }
      return false;
    })();
    const settled = job.finally(() => { if (this.pending === settled) this.pending = null; });
    this.pending = settled;
    return settled;
  }
}

/** Safari's HTMLMediaElement masks response HTTP status (usually MEDIA_ERR_SRC_NOT_SUPPORTED).
 * Query ONLY our trusted first-party backend for its current *global* extraction
 * cooldown. No track/video metadata, cookies, raw error body or media bytes sent.
 * Timeout fast on a sleeping Render instance, and degrade to existing recovery.
 * This is a read-only endpoint and MUST NOT trigger /download or HEAD /download.
 */
export async function inspectPlaybackLimit({
  fetcher=globalThis.fetch,backend=NATIVE_BACKEND,timeoutMs=2400
}={}){
  if(typeof fetcher!=='function')return null;
  const controller=typeof AbortController!=='undefined'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
  try{
    const response=await fetcher(new URL('/playback-status',backend).href,{
      method:'GET',cache:'no-store',credentials:'omit',
      ...(controller?{signal:controller.signal}:{})
    });
    if(!response?.ok)return null;
    const data=await response.json();
    if(data?.status!=='upstream_rate_limited')return null;
    const seconds=Number(data.retry_after);
    return {
      code:'upstream_rate_limited',
      retryAfter:Math.max(1,Math.min(3600,Number.isFinite(seconds)?Math.ceil(seconds):300))
    };
  }catch{return null}
  finally{if(timer!==null)clearTimeout(timer)}
}
export function playbackLimitMessage(limit){
  if(limit?.code!=='upstream_rate_limited')return null;
  const seconds=Math.max(1,Math.min(3600,Number(limit.retryAfter)||300));
  const minutes=Math.ceil(seconds/60);
  return 'O servidor de origem limitou novas músicas (HTTP 429). '+
    'Faixas já armazenadas em cache podem continuar disponíveis. '+
    'Aguarde aproximadamente '+minutes+' min para tentar novamente.';
}
