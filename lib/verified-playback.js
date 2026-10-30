/** Playback readiness is not the same as a successful catalogue lookup.
 * These rankings never invent an audio source, promote a preview to a full
 * track, or substitute another recording for the one selected by the user.
 */
export function isVerifiedFullTrack(track,{offline=()=>false}={}){
 if(!track||typeof track!=='object')return false;
 if(track.source==='local'&&!!track.url)return true;
 if(track.id&&offline(track.id))return true;
 if(track.source==='youtube')return track.playbackAvailability==='r2'&&
  /^[A-Za-z0-9_-]{11}$/.test(track.videoId||'');
 if(track.source==='audius')return /^audius:[A-Za-z0-9]{3,64}$/.test(track.id||'')&&
  track.audiusId===track.id.slice(7);
 return false;
}
export function playbackPriority(track,options={}){
 if(track?.id&&options.offline?.(track.id))return 0;
 if(track?.source==='local'&&track.url)return 0;
 if(track?.source==='youtube'&&isVerifiedFullTrack(track,options))return 1;
 if(track?.source==='audius'&&isVerifiedFullTrack(track,options))return 2;
 if(track?.source==='preview')return 3; // 30-second preview, not full audio.
 return 4; // YouTube metadata/untested URL, NOT a verified stream.
}
/** Stable sort: keep personal ranking *within* each availability class. */
export function verifiedFirst(tracks=[],options={}){
 return (tracks||[]).map((item,index)=>({item,index}))
  .sort((a,b)=>playbackPriority(a.item,options)-playbackPriority(b.item,options)||a.index-b.index)
  .map(x=>x.item);
}
export function readyQueueCandidates(tracks=[],options={}){
 return verifiedFirst(tracks.filter(t=>isVerifiedFullTrack(t,options)),options);
}
