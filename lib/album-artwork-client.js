/** Browser-side memoized album lookup. Audio URLs and song identity are untouched. */
import {inferredCredit,isGenericArtist} from './metadata-intelligence.js';
const cache=new Map(),pending=new Map(),waiters=[];
let running=0;
function queue(task){
 return new Promise((resolve,reject)=>{
  const run=()=>{
   running++;
   Promise.resolve().then(task).then(resolve,reject).finally(()=>{
    running--;
    waiters.shift()?.();
   });
  };
  if(running<2)run();else waiters.push(run);
 });
}
export function shouldLookupAlbumArtwork(track,{forBackground=false}={}){
 if(!track||!['youtube','local','audius','jamendo'].includes(track.source))return false;
 const credit=inferredCredit(track.title,track.artist);
 if(!credit.title||isGenericArtist(credit.artist)||(!Number(track.duration)&&!track.album))return false;
 // Ordinary thumbnail enrichment avoids repeated requests for official covers.
 // Fullscreen can recheck an official source if the decoded pixels are weak.
 if(!forBackground){
  if(/(?:^|\.)mzstatic\.com\//i.test(String(track.artwork||'')))return false;
  if(track.artworkProvider==='apple'||track.artworkProvider==='deezer')return false;
 }
 return true;
}
export function requestVerifiedAlbumArtwork(track,options={}){
 if(!shouldLookupAlbumArtwork(track,options))return Promise.resolve(null);
 const credit=inferredCredit(track.title,track.artist);
 const key=[credit.title,credit.artist,track.album||'',Math.round(Number(track.duration)||0),
  options.forBackground?'hd':'default'].join('|').toLowerCase();
 const cached=cache.get(key);if(cached&&cached.until>Date.now())return Promise.resolve(cached.value);
 if(pending.has(key))return pending.get(key);
 const promise=queue(async()=>{
  // Versioned request avoids old edge caches of failed 20-minute album matches.
  const p=new URLSearchParams({v:'verified-cover-v5',title:String(credit.title).slice(0,160),
   artist:String(credit.artist).slice(0,110),album:String(track.album||'').slice(0,135),
   duration:String(Number(track.duration)||0)});
  if(options.forBackground)p.set('mode','hd');
  try{
   const response=await fetch('/api/artwork?'+p,{headers:{accept:'application/json'}});
   if(!response.ok)return null;
   const value=await response.json();
   if(typeof value?.artwork!=='string'||!value.artwork.startsWith('https://'))return null;
   if(!['apple','deezer','musicbrainz'].includes(value.provider))return null;
   const candidates=(Array.isArray(value.candidates)?value.candidates:[])
    .filter(item=>item&&typeof item.artwork==='string'&&item.artwork.startsWith('https://')&&
      ['apple','deezer','musicbrainz'].includes(item.provider))
    .slice(0,3).map(item=>({url:item.artwork,provider:item.provider}));
   return {url:value.artwork,provider:value.provider,alternatives:candidates};
  }catch{return null}
 }).then(value=>{
  cache.set(key,{value,until:Date.now()+(value?24*3600e3:4*60e3)});
  if(cache.size>160)cache.delete(cache.keys().next().value);
  return value;
 }).finally(()=>pending.delete(key));
 pending.set(key,promise);return promise;
}
