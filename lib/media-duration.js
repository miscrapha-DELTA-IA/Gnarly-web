/** GNARLY media-timeline reconciliation.
 * Catalog durations can be wrong (short single vs long live take, remix,
 * different upload). The HTMLMediaElement's *decoded* media duration is the
 * authoritative timeline once known. Never stop a real recording solely
 * because a catalogue and decoder disagree, even by more than 40%.
 * A potential ghost tail remains diagnostic until independently confirmed.
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
 const duration=media||catalog;
 // A real recording's metadata can be off slightly. Allow the actual audio
 // to run past its nominal end for 8–18 s; do not end purely on timestamps
 // when the browser-reported duration is consistent with the catalogue.
 const grace=Math.max(8,Math.min(18,catalog*.05));
 return {duration,inflated,mediaDuration:media,catalogDuration:catalog,
  ghostEndAt:inflated?catalog+grace:0};
}
export function shouldFinishGhostTail({mediaDuration=0,catalogDuration=0,
 source='',offline=false,currentTime=0,paused=false,ended=false,
 recovering=false,confirmedSilentTail=false}={}){
 // Clock progression and catalogue mismatch alone NEVER prove silence.
 if(paused||ended||recovering||!confirmedSilentTail)return false;
 const timing=mediaTimeline({mediaDuration,catalogDuration,source,offline});
 const position=Number(currentTime);
 return timing.inflated&&Number.isFinite(position)&&
  position>=timing.ghostEndAt&&position<timing.mediaDuration;
}
