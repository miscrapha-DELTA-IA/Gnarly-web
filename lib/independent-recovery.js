/** Recover a blocked YouTube selection without a YouTube extraction.
 * Do not turn a coincidentally named remix, live version or preview into the
 * selected recording. A replacement MUST have identical normalized title and
 * artist, non-generic credits and duration within two seconds.
 */
import {normalized,isGenericArtist} from './metadata-intelligence.js';
import {searchAudius} from './audius-catalog.js';
export function exactIndependentRecording(original,candidates=[]){
 if(original?.source!=='youtube'||!original?.title||
  !original.artist||isGenericArtist(original.artist))return null;
 const title=normalized(original.title),artist=normalized(original.artist);
 const duration=Number(original.duration);
 if(!title||!artist||!Number.isFinite(duration)||duration<=0)return null;
 const candidatesMatching=(candidates||[]).filter(x=>
  (x?.source==='audius'||x?.source==='jamendo')&&
  (x.source==='audius'
   ? x.id==='audius:'+x.audiusId&&/^\w{3,64}$/.test(String(x.audiusId||''))
   : x.id==='jamendo:'+x.jamendoId&&/^\d{1,16}$/.test(String(x.jamendoId||'')))&&
  normalized(x.title)===title&&
  normalized(x.artist)===artist&&
  Number.isFinite(Number(x.duration))&&
  Math.abs(Number(x.duration)-duration)<=2);
 // Multiple versions with identical metadata are ambiguous: do not guess.
 return candidatesMatching.length===1?candidatesMatching[0]:null;
}
const resolved=new Map();
const ttl=3*60*1000;
export async function findIndependentRecording(track,{
 search=searchAudius,now=Date.now,signal
}={}){
 if(track?.source!=='youtube'||!track.videoId||isGenericArtist(track.artist))return null;
 const key=track.videoId+'|'+normalized(track.title)+'|'+normalized(track.artist)+'|'+track.duration;
 const existing=resolved.get(key);
 if(existing&&now()-existing.at<ttl)return existing.item;
 if(signal?.aborted)return null;
 let result=null;
 try{
  const entries=await search(track.artist+' '+track.title,{limit:20,signal});
  result=exactIndependentRecording(track,entries);
 }catch{}
 // Never cache a canceled result: a new track selection must be free to retry.
 if(!signal?.aborted){
  resolved.delete(key);resolved.set(key,{at:now(),item:result});
  while(resolved.size>80)resolved.delete(resolved.keys().next().value);
 }
 return signal?.aborted?null:result;
}
