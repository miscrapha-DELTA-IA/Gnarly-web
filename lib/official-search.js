/** The Omnibox is an OFFICIAL SONG search, not an open-audio aggregator.
 * Provider matching during playback is a separate, invisible operation.
 * YT Music song IDs have actual native music metadata; a title match alone
 * does NOT establish stream availability or the identity of an Audius cover.
 */
import {songMatchScore,songSearchKey} from './song-first.js';

const VERSION_TERMS=['cover','remix','bootleg','karaoke','nightcore','slowed','sped up',
 'sped-up','instrumental','reverb','8d audio','type beat','fanmade','fan made',
 'unreleased','leaked','reaction','live version','live performance','bass boosted'];
const contains=(text,term)=>new RegExp('(?:^|\\s)'+term.replace(/[-\\^$*+?.()|[\]{}]/g,'\\$&')+'(?:$|\\s)').test(' '+songSearchKey(text)+' ');
export function unrequestedVersion(track,query){
 const title=songSearchKey(track?.title);
 const q=songSearchKey(query);
 if(!title||!q)return false;
 return VERSION_TERMS.some(term=>contains(title,term)&&!contains(q,term));
}
const validYT=x=>x?.source==='youtube'&&/^[A-Za-z0-9_-]{11}$/.test(x?.videoId||'')&&!!x.title;
const distinct=items=>{
 const seen=new Set();
 return items.filter(x=>x&&x.id&&!seen.has(x.id)&&seen.add(x.id));
};
/** YouTube Music native songs first. R2 metadata may supplement only relevant
 * official-song matches. iTunes official previews are clearly separate
 * fallback metadata, never a full YouTube song and never Audius noise.
 */
export function curateOfficialSearch(query,{native=[],ready=[],previews=[]}={}){
 const nativeSongs=distinct(native.filter(validYT)).filter(x=>!unrequestedVersion(x,query));
 const cachedSongs=distinct(ready.filter(x=>validYT(x)&&
  songMatchScore(x,query)>=80&&!unrequestedVersion(x,query)));
 const songs=distinct([...nativeSongs,...cachedSongs]);
 if(songs.length)return {songs,mode:'youtube-music'};
 const apple=distinct(previews.filter(x=>x?.source==='preview'&&!!x.title&&
  !!x.url&&!unrequestedVersion(x,query)));
 return {songs:apple,mode:apple.length?'apple-previews':'empty'};
}
