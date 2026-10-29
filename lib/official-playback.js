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
