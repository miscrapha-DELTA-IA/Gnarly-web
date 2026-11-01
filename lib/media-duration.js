/** GNARLY media-timeline reconciliation.
 * An HTTP AAC/M4A origin may report a playable media duration that extends
 * well past its actual recording, causing the HTMLAudioElement to stay
 * "playing" in silence and never dispatch 'ended'.
 *
 * Only a catalogued full YouTube recording with a plausible independent
 * duration may override a substantially inflated browser duration. No
 * fallback based on song loudness, random buffer gaps, local uploads,
 * explicit previews, live streams or a stale previous track.
 */
const finitePositive=value=>{
 const n=Number(value);
 return Number.isFinite(n)&&n>0?n:0;
};
export function mediaTimeline({mediaDuration=0,catalogDuration=0,source='',offline=false}={}){
 const media=finitePositive(mediaDuration);
 const catalog=finitePositive(catalogDuration);
 const credible=source==='youtube'&&!offline&&catalog>=30&&catalog<=3600;
 // Only large disagreements warrant automatic completion; remixes and
 // legitimate extended cuts must not be truncated due to small metadata drift.
 const discrepancy=Math.max(50,catalog*.4);
 const inflated=Boolean(credible&&media>catalog+discrepancy&&media>catalog*1.4);
 const duration=inflated?catalog:(media||catalog);
 // A real recording's metadata can be off slightly. Allow the actual audio
 // to run past its nominal end for 8–18 s; do not end purely on timestamps
 // when the browser-reported duration is consistent with the catalogue.
 const grace=Math.max(8,Math.min(18,catalog*.05));
 return {duration,inflated,mediaDuration:media,catalogDuration:catalog,
  ghostEndAt:inflated?catalog+grace:0};
}
export function shouldFinishGhostTail({mediaDuration=0,catalogDuration=0,
 source='',offline=false,currentTime=0,paused=false,ended=false,
 recovering=false}={}){
 if(paused||ended||recovering)return false;
 const timing=mediaTimeline({mediaDuration,catalogDuration,source,offline});
 const position=Number(currentTime);
 return timing.inflated&&Number.isFinite(position)&&
  position>=timing.ghostEndAt&&position<timing.mediaDuration;
}
