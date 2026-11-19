/** Deterministic cover fallback for audio that was explicitly saved offline.
 * Video IDs identify thumbnail resources, not alternate audio sources.
 * Avoid remote search, metadata lookups and network-only artwork upgrades.
 */
import {youtubeID} from './playback-source.js';

export const GNARLY_ART_ICON='/assets/gnarly-icon.png';
const validArtwork=value=>{
 if(typeof value!=='string'||value.length>1200)return '';
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';
 }catch{return ''}
};
export function canonicalOfflineArtwork(track){
 const id=youtubeID(track);
 return id?'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg':'';
}
export function artworkForMode(track,{online=true,background=false,icon=GNARLY_ART_ICON}={}){
 const original=background?track?.backgroundArtwork||track?.artwork:track?.artwork;
 // While connected, keep the existing verified album art and HD pipeline.
 if(online)return original||icon;
 // While offline, a deterministic thumbnail saved together with the audio
 // remains available even if Apple/MusicBrainz replaces the original URL.
 return canonicalOfflineArtwork(track)||original||icon;
}
export function offlineArtworkPrefetchURLs(tracks){
 const items=Array.isArray(tracks)?tracks:[tracks];
 const urls=[];
 for(const track of items){
  if(!track)continue;
  const original=validArtwork(track.artwork);
  const background=validArtwork(track.backgroundArtwork);
  const canonical=canonicalOfflineArtwork(track);
  // Canonical low-bandwidth cover first, richer album artwork second.
  for(const url of [canonical,original,background]){
   if(url&&!urls.includes(url))urls.push(url);
  }
 }
 return urls;
}
