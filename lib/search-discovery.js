/** Zero-query discovery. No fabricated catalogue records or extra media URLs.
 * Mix user-owned library with real provider results; streaming never starts here.
 */
import {normalKey} from './omnibox.js';

const eligible=track=>!!track?.id&&!!track?.title&&
 (track.source==='youtube'||track.source==='audius'||track.source==='local'||track.source==='preview');
const key=track=>(normalKey((track.artist||'')+' '+(track.title||''))||String(track.id))+(track.source==='audius'?'|audius':'|catalog');
const uniquePool=items=>{
 const seen=new Set(),out=[];
 for(const item of items||[]){
  if(!eligible(item))continue;
  const identity=key(item);
  if(seen.has(identity))continue;
  seen.add(identity);out.push(item);
 }
 return out;
};
/** Reuse profile affinity, but keep a broad discovery query to escape
 * the echo chamber. Return at most 2 provider searches per opening.
 */
export function discoveryQueries({favorites=[],history=[],memory=null,now=Date.now()}={}){
 const favored=memory?.affinityArtists?.('',2)||[];
 const personal=[...favored,
  ...favorites.map(t=>t?.artist),
  ...history.map(t=>t?.artist)].map(x=>String(x||'').trim())
  .filter(x=>x&&!/^(youtube|youtube music|artista não identificado|unknown artist)$/i.test(x));
 const genres=['pop','rock','hip hop','eletrônica','indie','r&b'];
 const rotation=Math.floor(now/86400000)%genres.length;
 const main=personal[0]||genres[rotation];
 const broad=genres[(rotation+2)%genres.length];
 return [main,broad].filter((x,i,a)=>a.findIndex(y=>normalKey(y)===normalKey(x))===i).slice(0,2);
}
/** Weighted rotation keeps favorites and familiarity near the top without
 * monopolizing the list; alternate discovery batches and avoid adjacent
 * repeats of the same artist when a different option is available.
 */
export function mixDiscoveryFeed({
 favorites=[],history=[],playlists=[],offline=[],queue=[],remote=[],previous=[],
 current=null,max=36
}={}){
 const sources=[
  uniquePool(favorites),uniquePool(remote.filter((_,i)=>i%2===0)),
  uniquePool(history),uniquePool(remote.filter((_,i)=>i%2===1)),
  uniquePool(playlists),uniquePool(offline),uniquePool(queue),uniquePool(previous)
 ];
 const schedule=[0,1,2,3,4,1,5,3,0,6,2,1,4,3,7,1];
 const seen=new Set(),results=[];
 const currentKey=current?key(current):null;
 function take(bucket){
  const pool=sources[bucket];
  while(pool.length){
   let index=pool.findIndex(t=>!seen.has(key(t))&&key(t)!==currentKey&&
    normalKey(t.artist)!==normalKey(results.at(-1)?.artist));
   if(index<0)index=pool.findIndex(t=>!seen.has(key(t))&&key(t)!==currentKey);
   if(index<0)return false;
   const [track]=pool.splice(index,1);seen.add(key(track));results.push(track);return true;
  }
  return false;
 }
 const limit=Math.min(60,Math.max(1,Number(max)||36));
 let progress=true;
 while(progress&&results.length<limit){
  progress=false;
  for(const bucket of schedule){
   if(results.length>=limit)break;
   progress=take(bucket)||progress;
  }
 }
 return results;
}
