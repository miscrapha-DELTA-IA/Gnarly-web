/** Official playback is separate from GNARLY's HTMLAudioElement.
 * No audio extraction, hidden video, third-party credentials or Spotify tokens.
 * YouTube requires a visible player with its native controls.
 */
const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
export function officialVideoId(track){
 return track?.source==='youtube'&&VIDEO_ID.test(track?.videoId||'')?track.videoId:null;
}
export function officialWatchURL(track){
 const id=officialVideoId(track);
 return id?'https://www.youtube.com/watch?v='+id:null;
}
export function officialEmbedURL(track){
 const id=officialVideoId(track);
 if(!id)return null;
 // No autoplay: the listener presses Play on the visible official iframe.
 // This avoids unexpected automatic playback when a late 429 is detected.
 return 'https://www.youtube-nocookie.com/embed/'+id+'?playsinline=1&controls=1&autoplay=0';
}
export function canUseOfficial(track,{offline=false}={}){
 return !offline&&!!officialVideoId(track);
}

/** The native player already exhausted its bounded recovery. Fail over only
 * for a valid remote recording, not when browser permissions or a deliberate
 * interruption prevented playback. No new audio extraction is initiated.
 */
export function shouldUseOfficialAfterNativeFailure(track,{offline=false,error=null}={}){
 if(!canUseOfficial(track,{offline}))return false;
 return error?.name!=='NotAllowedError'&&error?.name!=='AbortError';
}
