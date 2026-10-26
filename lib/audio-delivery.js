/**
 * GNARLY browser playback resilience. This module only retries the exact
 * canonical YouTube ID already selected by the Omnibox. It never selects a
 * different recording, exposes credentials or bypasses a provider restriction.
 */
import {youtubeID} from './playback-source.js';

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
          if (failure?.name === 'NotAllowedError' || failure?.name === 'AbortError') return false;
        }
      }
      return false;
    })();
    const settled = job.finally(() => { if (this.pending === settled) this.pending = null; });
    this.pending = settled;
    return settled;
  }
}
