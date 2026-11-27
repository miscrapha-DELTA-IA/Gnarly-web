/** GNARLY media-timeline reconciliation.
 * Browser audio.duration may reflect unreliable M4A container metadata,
 * rather than actual audible samples. For substantial discrepancies in
 * ordinary known YouTube recordings, show a provisional catalogue timeline
 * without truncating native transport. Decoded sound beyond the nominal end
 * restores the complete native timeline. Never advance based on time alone.
 */
const finitePositive=value=>{
 const n=Number(value);
 return Number.isFinite(n)&&n>0?n:0;
};
export function mediaTimeline({mediaDuration=0,catalogDuration=0,
 source='',offline=false,audibleExtended=false}={}){
 const media=finitePositive(mediaDuration);
 const catalog=finitePositive(catalogDuration);
 // A canonical YouTube recording with a meaningful catalogue duration is
 // eligible for provisional reconciliation, including cached copies of the
 // same canonical recording. Local imports and other providers remain native.
 const credible=source==='youtube'&&catalog>=45&&catalog<=600;
 // Broad enough for 1.3x/1.5x/2.5x M4A metadata errors, but ordinary
 // rounding/drift stays native. No mismatch alone authorizes termination.
 const discrepancy=Math.max(35,catalog*.2);
 const inflated=Boolean(credible&&media>catalog+discrepancy&&media>catalog*1.2);
 // Keep the narrow 2x fingerprint for diagnostics and existing consumers.
 const doubled=Boolean(credible&&media-catalog>=60&&
  media>=catalog*1.85&&media<=catalog*2.15);
 const duration=inflated&&!audibleExtended?catalog:(media||catalog);
 // A real recording's metadata can be off slightly. Allow the actual audio
 // to run past its nominal end for 8–18 s; do not end purely on timestamps
 // when the browser-reported duration is consistent with the catalogue.
 const grace=Math.max(8,Math.min(18,catalog*.05));
 return {duration,inflated,suspectedDouble:doubled,transportDuration:media||catalog,
  provisional:Boolean(inflated&&!audibleExtended),mediaDuration:media,catalogDuration:catalog,
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
