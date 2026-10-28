import {displayArtist,isGenericArtist} from './metadata-intelligence.js';
// Port of the Stage 72 OmniboxEngine contracts: direct-link intent, local instant
// history, token coverage, frecency, dedupe, cache with stale fallback.
const videoRE=/^[a-zA-Z0-9_-]{11}$/;
export function classifyIntent(input){
 const text=String(input??'').trim();if(!text)return {kind:'empty'};
 try{const u=new URL(text);const host=u.hostname.toLowerCase();if(host==='youtu.be'||host==='www.youtube.com'||host==='youtube.com'||host==='m.youtube.com'||host==='music.youtube.com'){const id=host==='youtu.be'?u.pathname.slice(1).split('/')[0]:u.searchParams.get('v');if(videoRE.test(id||''))return {kind:'direct',videoId:id}}}catch{}
 if(videoRE.test(text)&&(/[0-9_-]/.test(text)||(/[A-Z]/.test(text)&&/[a-z]/.test(text))))return {kind:'direct',videoId:text};
 return {kind:'text',query:text};
}
export function normalKey(text){return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
export function coverage(term,item){const terms=normalKey(term).split(' ').filter(Boolean),keys=normalKey(item.artist+' '+item.title).split(' ');return terms.length?terms.filter(q=>keys.some(t=>t.startsWith(q))).length/terms.length:0}
export function frecency(entry,now=Date.now()){if(!entry)return 0;const days=Math.max(0,(now-(entry.lastPlayed||now))/86400000);return .6*Math.min(1,Math.log1p(entry.plays||0)/Math.log1p(20))+.4*Math.exp(-days/21)}
/** Rank a submitted query by actual textual relevance, not listening history.
 * The backend/provider order is a small tie-breaker; personalization belongs
 * in the empty-query discovery feed, never in active catalogue results.
 * Never truncate here: the UI controls pagination explicitly.
 */
export function rank(query,remote=[],history=[],now=Date.now()){
 const normalized=normalKey(query),tokens=normalized.split(' ').filter(Boolean);
 const wantsLong=/\b(mix|live|hour|set)\b/.test(normalized);
 const winner=new Map();
 for(let i=0;i<remote.length;i++){
  const item=remote[i];if(!item?.id||!item.title)continue;
  const title=normalKey(item.title),artist=normalKey(item.artist),album=normalKey(item.album);
  const haystack=title+' '+artist+' '+album;
  const hit=coverage(query,item),titleCoverage=tokens.length?tokens.filter(t=>title.split(' ').some(x=>x.startsWith(t))).length/tokens.length:0;
  const exact=title===normalized?1:0;
  const phrase=normalized.length>1&&(title.includes(normalized)||haystack.includes(normalized))?1:0;
  const artistMatch=artist===normalized?1:0;
  const providerOrder=1/(1+i*.075);
  const duration=Number(item.duration);
  const durationPenalty=!wantsLong&&duration>0&&(duration<45||duration>720)?.16:0;
  const relevance=.48*hit+.22*titleCoverage+.16*phrase+.12*exact+.06*artistMatch;
  const score=relevance+.075*providerOrder+(item.source==='youtube'?.025:0)-durationPenalty;
  // A remix/live/acoustic edit remains separate when the version is in title.
  const key=normalKey(item.artist+' '+item.title)||item.id;
  const previous=winner.get(key);
  if(!previous||score>previous.score)winner.set(key,{item,score,index:i});
 }
 return [...winner.values()].sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.item);
}
export function localMatches(term,history=[]){return history.filter(x=>coverage(term,x)>.99).sort((a,b)=>frecency(b)-frecency(a)).slice(0,4)}
/** Persist only public catalogue metadata, never object URLs or local files. */
function safeCachedTrack(item){
 if(!item||!['youtube','preview'].includes(item.source)||typeof item.title!=='string'||!item.id)return null;
 if(item.source==='youtube'&&!/^[A-Za-z0-9_-]{11}$/.test(item.videoId||''))return null;
 if(item.source==='preview'&&!(typeof item.url==='string'&&item.url.startsWith('https://')))return null;
 const safe=(value,n)=>String(value||'').slice(0,n);
 return {id:safe(item.id,120),source:item.source,title:safe(item.title,170),
  artist:safe(item.artist,110),album:safe(item.album,120),artwork:safe(item.artwork,500),
  duration:Number.isFinite(Number(item.duration))?Number(item.duration):0,
  ...(item.source==='youtube'?{videoId:item.videoId}:{url:safe(item.url,500)})};
}
export class OmniboxSession{
 constructor(storage=null){
  this.storage=storage;this.cache=new Map();
  const persisted=this.read('search-cache',[]);
  if(Array.isArray(persisted))for(const entry of persisted.slice(-8)){
   if(typeof entry?.key!=='string'||!Array.isArray(entry.results)||!Number.isFinite(entry.savedAt)
      ||Date.now()-entry.savedAt>1200000)continue;
   const items=entry.results.slice(0,14).map(safeCachedTrack).filter(Boolean);
   if(items.length)this.cache.set(normalKey(entry.key),{savedAt:entry.savedAt,results:items});
  }
  const old=this.read('history',[]);
  this.history=(Array.isArray(old)?old:[]).filter(x=>x&&typeof x==='object').map(x=>isGenericArtist(x.artist)?{...x,artist:displayArtist(x)}:x);
  if(JSON.stringify(this.history)!==JSON.stringify(old))this.save('history',this.history);
  this.query=this.read('query','');this.epoch=0;
 }
 read(key,fallback){try{return JSON.parse(this.storage?.getItem('gnarly.omnibox.'+key))??fallback}catch{return fallback}}
 save(key,value){try{this.storage?.setItem('gnarly.omnibox.'+key,JSON.stringify(value))}catch{}}
 setQuery(query){this.query=query;this.save('query',query);this.epoch++;return localMatches(query,this.history)}
 record(track){if(!track||track.source==='local')return;const old=this.history.find(x=>x.id===track.id);this.history=[{...track,artist:displayArtist(track),plays:(old?.plays||0)+1,lastPlayed:Date.now()},...this.history.filter(x=>x.id!==track.id)].slice(0,65);this.save('history',this.history)}
 updateMetadata(track){
  if(!track?.id)return;
  const current=this.history.find(item=>item.id===track.id);
  if(!current)return;
  // Update display fields only: never record an extra playback or overwrite identity.
  for(const key of ['title','artist','album','artwork','metadataSource','metadataConfidence','metadataIds']){
   if(track[key]!==undefined){if(key==='artist'&&!isGenericArtist(current.artist)&&isGenericArtist(track.artist))continue;current[key]=key==='artist'?displayArtist(track):track[key];}
  }
  this.save('history',this.history);
 }
 fromCache(query,now=Date.now()){
  const x=this.cache.get(normalKey(query));
  if(!x||now-x.savedAt>1200000)return null;
  return {results:x.results,stale:now-x.savedAt>90000};
 }
 /** Recycle previous successful catalogue pages while refining a query.
  * No unrelated artist/song is invented: instantSearch performs text filtering.
  */
 cachedMatches(query,max=80){
  const key=normalKey(query);
  if(!key)return [];
  const seen=new Set(),results=[];
  for(const [saved,entry] of [...this.cache].reverse()){
   if(Date.now()-entry.savedAt>1200000)continue;
   if(!saved.startsWith(key)&&!key.startsWith(saved))continue;
   for(const item of entry.results){
    if(seen.has(item.id))continue;
    seen.add(item.id);results.push(item);
    if(results.length>=max)return results;
   }
  }
  return results;
 }
 cacheResults(query,results){
  const key=normalKey(query),items=(results||[]).slice(0,14).map(safeCachedTrack).filter(Boolean);
  if(!key||!items.length)return;
  this.cache.delete(key);this.cache.set(key,{savedAt:Date.now(),results:items});
  while(this.cache.size>18)this.cache.delete(this.cache.keys().next().value);
  const entries=[...this.cache].slice(-8).map(([key,entry])=>({key,...entry}));
  this.save('search-cache',entries);
 }
}
