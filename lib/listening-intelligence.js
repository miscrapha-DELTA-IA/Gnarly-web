/**
 * GNARLY Listening Intelligence.
 * Privacy-first, bounded device-local behavioral signals. No server tracking,
 * no user identifiers, Spotify credentials, ML model downloads or audio uploads.
 * Learns from real playback, completion, explicit favorites and intentional skips.
 * Listening history is shared by Omnibox and all smart queue modes on this origin.
 */
import {isGenericArtist,normalized} from './metadata-intelligence.js';
export const MEMORY_KEY='gnarly.listening-intelligence.v1';
const EVENT_LIMIT=180,EXPOSURE_LIMIT=110,AGE=1000*60*60*24*75;
const clean=(s,n=150)=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
const safeNum=n=>Number.isFinite(Number(n))?Number(n):0;
const eligible=t=>!!t?.id&&!!t?.title&&t.source!=='local';
export function songFingerprint(t){
 if(!t)return '';
 if(t.videoId&&/^[\w-]{11}$/.test(t.videoId))return 'video:'+t.videoId;
 const artist=normalized(t.artist),title=normalized(t.title);
 return artist&&!isGenericArtist(t.artist)&&title?'song:'+artist+'|'+title:'id:'+clean(t.id,140);
}
export function sameRecording(a,b){
 if(!a||!b)return false;
 if(a.id===b.id)return true;
 const videoA=a.videoId,videoB=b.videoId;
 if(videoA&&videoB&&videoA===videoB)return true;
 const titleA=normalized(a.title),titleB=normalized(b.title),artistA=normalized(a.artist),artistB=normalized(b.artist);
 if(!titleA||titleA!==titleB||!artistA||artistA!==artistB||isGenericArtist(a.artist)||isGenericArtist(b.artist))return false;
 const da=safeNum(a.duration),db=safeNum(b.duration);
 return !da||!db||Math.abs(da-db)<=7;
}
function readSnapshot(storage){
 try{
  const obj=JSON.parse(storage?.getItem(MEMORY_KEY)||'{}');
  const now=Date.now();
  return {events:Array.isArray(obj.events)?obj.events.filter(x=>x&&['play','finish','skip','like','unlike'].includes(x.type)&&x.key&&x.at>now-AGE).slice(-EVENT_LIMIT):[],
   exposures:Array.isArray(obj.exposures)?obj.exposures.filter(x=>x&&x.key&&x.at>now-7*86400000).slice(-EXPOSURE_LIMIT):[]};
 }catch{return {events:[],exposures:[]}}
}
export class ListeningMemory{
 constructor(storage=null){this.storage=storage;this.events=[];this.exposures=[];this.refresh()}
 refresh(){const s=readSnapshot(this.storage);this.events=s.events;this.exposures=s.exposures;return this}
 save(){
  try{this.storage?.setItem(MEMORY_KEY,JSON.stringify({events:this.events.slice(-EVENT_LIMIT),exposures:this.exposures.slice(-EXPOSURE_LIMIT)}))}catch{}
 }
 record(type,track,now=Date.now()){
  if(!['play','finish','skip','like','unlike'].includes(type)||!eligible(track))return false;
  this.refresh();const key=songFingerprint(track);
  const last=this.events[this.events.length-1];
  if(last?.type===type&&last.key===key&&now-last.at<2000)return false;
  this.events.push({type,key,at:now,artist:clean(track.artist,100),album:clean(track.album,100),title:clean(track.title,140)});
  this.events=this.events.slice(-EVENT_LIMIT);this.save();return true;
 }
 expose(tracks,mode,now=Date.now()){
  if(!['artist','album','mix','playlist'].includes(mode))return;
  this.refresh();
  const keys=new Set();
  for(const t of (tracks||[]).slice(0,12)){
   if(!eligible(t))continue;const key=songFingerprint(t);if(!key||keys.has(key))continue;
   keys.add(key);this.exposures.push({key,mode,at:now});
  }
  this.exposures=this.exposures.slice(-EXPOSURE_LIMIT);this.save();
 }
 recentKeys(windowMs=24*3600000,now=Date.now()){
  return new Set(this.events.filter(x=>['play','finish'].includes(x.type)&&now-x.at<windowMs).map(x=>x.key));
 }
 profile(now=Date.now()){
  const artists=new Map(),albums=new Map(),last=new Map(),likes=new Set(),skips=new Set();
  for(const e of this.events){
   const days=Math.max(0,(now-e.at)/86400000),decay=Math.exp(-days/35);
   const weight=({play:1,finish:3,skip:-1.5,like:5,unlike:-4})[e.type]*decay;
   const a=normalized(e.artist),al=normalized(e.album);
   if(a&&!isGenericArtist(e.artist))artists.set(a,(artists.get(a)||0)+weight);
   if(a&&al)albums.set(a+'|'+al,(albums.get(a+'|'+al)||0)+weight);
   if(['play','finish'].includes(e.type))last.set(e.key,Math.max(e.at,last.get(e.key)||0));
   if(e.type==='like')likes.add(e.key);
   if(e.type==='unlike')likes.delete(e.key);
   if(e.type==='skip')skips.add(e.key);
   if(e.type==='finish')skips.delete(e.key);
  }
  return {artists,albums,last,likes,skips};
 }
 affinityArtists(exclude='',limit=3,now=Date.now()){
  const ignored=normalized(exclude);
  return [...this.profile(now).artists.entries()].filter(([name,value])=>name!==ignored&&value>0)
   .sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([artist])=>artist);
 }
 clear(){this.events=[];this.exposures=[];this.save()}
 summary(){const p=this.profile();return {signals:this.events.length,artists:[...p.artists.entries()].filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0])}}
}
const tieBreak=(id,seed)=>{
 let n=2166136261;for(const c of (seed+'|'+id)){n^=c.charCodeAt(0);n=Math.imul(n,16777619)}return (n>>>0)/4294967296;
};
/** Exact identity constraints have priority over taste. Sorting only affects verified,
 * complete native tracks; preferences never override album/artist identity.
 */
export function recommendTracks({mode,anchor,candidates=[],existing=[],history=[],memory=null,max=7,revision=0,now=Date.now()}={}){
 if(!anchor||!['artist','album','mix'].includes(mode)||isGenericArtist(anchor.artist))return [];
 const artist=normalized(anchor.artist),album=normalized(anchor.album);
 if(mode==='album'&&!album)return [];
 const profile=memory?.profile(now)||{artists:new Map(),albums:new Map(),last:new Map(),likes:new Set(),skips:new Set()};
 const exposures=memory?.exposures||[],selected=[],scored=[],keys=new Set(),seed=mode+'|'+anchor.id+'|'+revision;
 const exclude=[anchor,...existing];
 const recent=new Set(history.slice(0,8).map(songFingerprint));
 for(const tr of candidates){
  if(!eligible(tr)||tr.source!=='youtube'||!/^[\w-]{11}$/.test(tr.videoId||'')||isGenericArtist(tr.artist))continue;
  if(exclude.some(x=>sameRecording(x,tr)))continue;
  const k=songFingerprint(tr);
  if(keys.has(k))continue;keys.add(k);
  const ta=normalized(tr.artist),al=normalized(tr.album),artistMatch=ta===artist,albumMatch=!!album&&al===album;
  if(mode==='artist'&&!artistMatch)continue;
  if(mode==='album'&&!(artistMatch&&albumMatch))continue;
  if(mode==='mix'&&!artistMatch&&(profile.artists.get(ta)||0)<=0)continue;
  const likes=profile.likes.has(k)?3:0,playedAt=profile.last.get(k)||0;
  const recentPlay=playedAt&&now-playedAt<48*3600000?-6:playedAt&&now-playedAt<14*86400000?-2:0;
  const exposed=exposures.filter(e=>e.key===k&&now-e.at<48*3600000).reduce((sum,e)=>sum+(e.mode===mode?3:1.6)*Math.exp(-(now-e.at)/(24*3600000)),0);
  const personal=Math.min(3,Math.max(-2,(profile.artists.get(ta)||0)*.4))+
    Math.min(2,Math.max(-1,(profile.albums.get(ta+'|'+al)||0)*.2));
  const score=(artistMatch?3.5:0)+(albumMatch?1:0)+(mode==='mix'&&!artistMatch?2:0)+likes+personal+recentPlay
    -(recent.has(k)?3:0)-(profile.skips.has(k)?3:0)-exposed+tieBreak(tr.id,seed)*1.9;
  scored.push({track:tr,score,artist:ta,album:al,key:k});
 }
 scored.sort((a,b)=>b.score-a.score||a.track.id.localeCompare(b.track.id));
 if(mode!=='mix')return scored.slice(0,max).map(x=>x.track);
 // Diversification with graceful sparse-catalog fallback, stable seed on same refresh.
 let prevArtist=artist,prevAlbum=album;
 while(scored.length&&selected.length<max){
  let best=-Infinity,index=0;
  for(let i=0;i<scored.length;i++){
   const c=scored[i],value=c.score-(c.artist===prevArtist?2.8:0)-(c.album&&c.album===prevAlbum?1.9:0);
   if(value>best){best=value;index=i}
  }
  const [next]=scored.splice(index,1);
  selected.push(next.track);prevArtist=next.artist;prevAlbum=next.album;
 }
 return selected;
}
/** Manual additions always survive a mode change. Auto recommendations are ephemeral. */
export function retainManualQueue(queue){return (queue||[]).filter(t=>!t._gnarlyAutoMode)}
export function markAutoTracks(tracks,mode){return tracks.map(x=>({...x,_gnarlyAutoMode:mode}))}
/** Explicit Omnibox search stays relevance-first. Only empty discovery is diversified. */
export function discoverySuggestions({history=[],favorites=[],queue=[],memory=null,max=8,now=Date.now()}={}){
 const eligibleTracks=[...favorites,...history].filter(t=>eligible(t)&&t.source==='youtube');
 const seen=[],chosen=[],p=memory?.profile(now);
 for(const tr of eligibleTracks){
  if(queue.some(q=>sameRecording(tr,q))||seen.some(x=>sameRecording(tr,x)))continue;
  seen.push(tr);
  const key=songFingerprint(tr),artist=normalized(tr.artist);
  const age=now-(p?.last.get(key)||0);
  const score=(p?.likes.has(key)?5:0)+(p?.artists.get(artist)||0)*.2+
   (age>3*86400000?2:age>12*3600000?0:-5);
  chosen.push({tr,score});
 }
 chosen.sort((a,b)=>b.score-a.score);
 const out=[],lastArtist='';
 for(const c of chosen){if(out.length>=max)break;if(out.some(x=>sameRecording(x,c.tr)))continue;out.push(c.tr)}
 return out;
}
