/**
 * GNARLY Adaptive Library — local-only, per-browser personalized cache planner.
 * It stores small metadata and engagement counters, NEVER audio, URLs of streams,
 * account IDs or remote tracking identifiers. Storage is best-effort.
 * Planning never downloads, extracts, deletes, queues or changes current audio.
 */
export const ADAPTIVE_KEY = 'gnarly.adaptive-library.v1';
const ID = /^[A-Za-z0-9_-]{11}$/;
const DAY_MS = 86400000;
const MAX_TRACKS = 900;
const MAX_DAYS = 35;
const MAX_DAILY_IDS = 400;
const clamp = (n,min,max) => Math.max(min,Math.min(max,Number.isFinite(n)?n:min));
const short = (s,max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const num = (v,max=1000000) => clamp(Math.floor(Number(v)||0),0,max);

export function adaptiveTrack(track) {
 const videoId = track?.source === 'youtube' ? track.videoId : null;
 if(typeof videoId !== 'string'||!ID.test(videoId)||!track?.title) return null;
 const artwork = String(track.artwork||'');
 return {
  id:'youtube:'+videoId, videoId, source:'youtube',
  title:short(track.title,180), artist:short(track.artist,100),
  album:short(track.album,110),
  duration:clamp(Number(track.duration)||0,0,36000),
  artwork:/^https:\/\//i.test(artwork)?artwork.slice(0,450):'',
  playbackAvailability:track.playbackAvailability==='r2'?'r2':'unknown'
 };
}
function dayKey(time) {
 const date = new Date(time);
 return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+
  '-'+String(date.getDate()).padStart(2,'0');
}
function freshDays(days,now) {
 const cutoff = dayKey(now-(MAX_DAYS-1)*DAY_MS);
 return days.filter(row=>row&&typeof row.day==='string'&&
  /^\d{4}-\d{2}-\d{2}$/.test(row.day)&&row.day>=cutoff&&row.day<=dayKey(now)&&
  Array.isArray(row.ids))
  .map(row=>({day:row.day,ids:[...new Set(row.ids.filter(id=>typeof id==='string'&&ID.test(id)))].slice(0,MAX_DAILY_IDS),
   overflow:num(row.overflow,100000)}))
  .slice(-MAX_DAYS);
}
function read(storage,now) {
 try{
  const data=JSON.parse(storage?.getItem(ADAPTIVE_KEY)||'{}');
  const tracks=new Map();
  for(const item of (Array.isArray(data.tracks)?data.tracks:[]).slice(-MAX_TRACKS)){
   const track=adaptiveTrack(item?.track);
   if(!track)continue;
   tracks.set(track.videoId,{
    track,plays:num(item.plays),finishes:num(item.finishes),skips:num(item.skips),
    liked:item.liked===true, lastPlay:clamp(Number(item.lastPlay)||0,0,now+60000),
    lastAction:clamp(Number(item.lastAction)||0,0,now+60000),
    lastSkip:clamp(Number(item.lastSkip)||0,0,now+60000)
   });
  }
  return {tracks,days:freshDays(Array.isArray(data.days)?data.days:[],now),
   core:Array.isArray(data.core)?data.core.filter(id=>typeof id==='string'&&ID.test(id)).slice(0,200):[]};
 }catch{return {tracks:new Map(),days:[],core:[]}}
}
function retention(entry, now) {
 const age = entry.lastPlay ? Math.max(0,(now-entry.lastPlay)/DAY_MS):1000;
 return Math.exp(-age/18);
}
export function adaptiveCapacity(dailyCounts=[]) {
 const counts=dailyCounts.filter(n=>Number.isFinite(n)&&n>0).map(n=>Math.min(400,n)).sort((a,b)=>a-b);
 if(!counts.length)return 40;
 // P75 favors listeners with occasional high-volume days without letting one
 // outlier or loop inflate a whole personalized library indefinitely.
 const p75=counts[Math.ceil(counts.length*.75)-1];
 return Math.round(clamp(p75*1.15+8,24,160));
}
export function adaptiveScore(entry,{favorite=false,playlist=false,queued=false,previousCore=false,now=Date.now()}={}) {
 const plays=num(entry?.plays),finishes=num(entry?.finishes),skips=num(entry?.skips);
 const recency=retention(entry||{},now);
 const recentSkip=entry?.lastSkip&&now-entry.lastSkip<3*DAY_MS ? 22 : 0;
 const score=(entry?.liked||favorite?75:0)+(playlist?38:0)+(queued?10:0)+
  15*Math.log1p(plays)+10*Math.log1p(finishes)+
  25*recency-(16*Math.log1p(skips))-recentSkip+(previousCore?10:0);
 return Math.round(score*100)/100;
}
export class AdaptiveLibrary {
 constructor(storage=null,{now=()=>Date.now()}={}) {
  this.storage=storage;this.now=now;
  const data=read(storage,now());
  this.tracks=data.tracks;this.days=data.days;this.core=data.core;
  this.lastEvent=null;
 }
 refresh() {
  const data=read(this.storage,this.now());
  this.tracks=data.tracks;this.days=data.days;this.core=data.core;
  return this;
 }
 save() {
  const now=this.now();
  this.days=freshDays(this.days,now);
  if(this.tracks.size>MAX_TRACKS){
   const sorted=[...this.tracks.entries()].sort((a,b)=>
    (b[1].liked?1:0)-(a[1].liked?1:0)||
    b[1].lastAction-a[1].lastAction||
    b[1].lastPlay-a[1].lastPlay);
   this.tracks=new Map(sorted.slice(0,MAX_TRACKS));
  }
  try{this.storage?.setItem(ADAPTIVE_KEY,JSON.stringify({
   v:1,tracks:[...this.tracks.values()],days:this.days,core:this.core.slice(0,200)
  }))}catch{/* Browser storage can be unavailable or full. */}
 }
 record(type,track,at=this.now()) {
  if(!['play','finish','skip','like','unlike'].includes(type))return false;
  const clean=adaptiveTrack(track);
  if(!clean||!Number.isFinite(at)||at<=0||at>this.now()+60000)return false;
  if(this.lastEvent?.type===type&&this.lastEvent.id===clean.videoId&&
     Math.abs(at-this.lastEvent.at)<1500)return false;
  this.lastEvent={type,id:clean.videoId,at};
  let entry=this.tracks.get(clean.videoId);
  if(!entry)entry={track:clean,plays:0,finishes:0,skips:0,liked:false,lastPlay:0,lastAction:0,lastSkip:0};
  entry.track={...entry.track,...clean,
   playbackAvailability:clean.playbackAvailability==='r2'?'r2':entry.track.playbackAvailability};
  entry.lastAction=Math.max(entry.lastAction,at);
  if(type==='play'){
   entry.plays++;entry.lastPlay=at;
   const day=dayKey(at);
   let daily=this.days.find(row=>row.day===day);
   if(!daily){daily={day,ids:[],overflow:0};this.days.push(daily)}
   if(!daily.ids.includes(clean.videoId)){
    if(daily.ids.length<MAX_DAILY_IDS)daily.ids.push(clean.videoId);
    else daily.overflow++;
   }
  }else if(type==='finish')entry.finishes++;
  else if(type==='skip'){entry.skips++;entry.lastSkip=at}
  else if(type==='like')entry.liked=true;
  else if(type==='unlike')entry.liked=false;
  this.tracks.set(clean.videoId,entry);
  this.save();return true;
 }
 dailyUsage(now=this.now()) {
  const cutoff=dayKey(now-13*DAY_MS),today=dayKey(now);
  const recent=this.days.filter(x=>x.day>=cutoff&&x.day<=today);
  const counts=recent.map(x=>x.ids.length+(x.overflow||0));
  return {today:recent.find(x=>x.day===today)?.ids.length||0,
   activeDays:recent.length, peak:Math.max(0,...counts),
   capacity:adaptiveCapacity(counts)};
 }
 plan({favorites=[],history=[],queue=[],playlists=[],offlineIds=[],now=this.now()}={}) {
  const capacity=this.dailyUsage(now).capacity;
  const stableSlots=Math.round(capacity*0.6875);
  const offline=new Set(offlineIds);
  const candidates=new Map();
  const groups={favorites:new Set(),playlists:new Set(),queue:new Set()};
  const include=(track,group)=>{
   const clean=adaptiveTrack(track);
   if(!clean)return;
   const id=clean.videoId,prior=candidates.get(id);
   candidates.set(id,prior?{...prior,...clean,
    playbackAvailability:prior.playbackAvailability==='r2'?'r2':clean.playbackAvailability}:clean);
   if(group)groups[group].add(id);
  };
  for(const entry of this.tracks.values())include(entry.track);
  for(const t of favorites)include(t,'favorites');
  for(const t of history)include(t);
  for(const t of queue)include(t,'queue');
  for(const t of playlists)include(t,'playlists');
  const previous=new Set(this.core);
  const ranked=[...candidates.values()].map(track=>{
   const id=track.videoId,entry=this.tracks.get(id)||{plays:0,finishes:0,skips:0,lastPlay:0,lastSkip:0};
   return {track,id,score:adaptiveScore(entry,{favorite:groups.favorites.has(id),
    playlist:groups.playlists.has(id),queued:groups.queue.has(id),
    previousCore:previous.has(id),now}),offline:offline.has(track.id)};
  }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const stable=ranked.slice(0,stableSlots);
  const rotating=ranked.slice(stable.length,capacity);
  return {capacity,stableSlots,rotatingSlots:capacity-stableSlots,
   stable,rotating,all:[...stable,...rotating],
   daily:this.dailyUsage(now),candidates:ranked.length};
 }
 commitPlan(plan) {
  const next=plan?.stable?.map(x=>x.id).filter(id=>ID.test(id))||[];
  if(next.join('|')===this.core.join('|'))return false;
  this.core=next.slice(0,200);this.save();return true;
 }
 clear() {this.tracks=new Map();this.days=[];this.core=[];this.lastEvent=null;this.save()}
}
/** Only already verified, cached R2 recordings are candidates for an optional
 * device download. This NEVER consults an extractor or changes the player's queue. */
export function adaptiveReadyCandidate(plan,{offlineIds=[],excludeIds=[]}={}) {
 const offline=new Set(offlineIds),excluded=new Set(excludeIds);
 for(const item of plan?.all||[]){
  if(item.track.playbackAvailability!=='r2'||offline.has(item.track.id)||
     excluded.has(item.track.id))continue;
  return item.track;
 }
 return null;
}
