/**
 * GNARLY · album artwork independent of YouTube video thumbnails.
 *
 * Only attach covers when song title, credited artist and recording duration
 * agree. This endpoint NEVER changes audio/source/video ID or music metadata.
 * Apple iTunes and Deezer are queried server-side (no extra browser CORS,
 * credentials, third-party image-proxy, or video-frame upscaling).
 */
import {cleanTitle,normalized,isGenericArtist,matchMusicBrainz} from './metadata-intelligence.js';

const cache=new Map(),inflight=new Map(),MAX_CACHE=220,POSITIVE_TTL=24*60*60*1000,NEGATIVE_TTL=4*60*1000;
const sanitize=(s,n=150)=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
const matchKey=value=>normalized(cleanTitle(value)
 .replace(/\s*[([]\s*(?:feat\.?|ft\.?|featuring)\b[^)\]]*[)\]]/gi,'')
 .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+[^,;]+$/i,''));
const recordHead=value=>normalized(String(value).split(/\s+(?:feat\.?|ft\.?|featuring|with)\s+/i)[0].split(/\s+[&;,]\s+/)[0]);
const albumKey=value=>normalized(String(value).replace(/\s*[([]\s*(?:deluxe|expanded|special|anniversary|remastered?)\b[^)\]]*[)\]]/gi,''));
function creditedArtists(value){
 // Music catalogs disagree on collaboration separators: "Yeat, Lancey Foux"
 // versus "Yeat & Lancey Foux". Compare the full credited set, not only
 // the first artist, avoiding silent replacements with unrelated recordings.
 return String(value||'').replace(/\b(?:feat\.?|ft\.?|featuring|with)\b/gi,' & ')
  .split(/\s*(?:[,&;]|\band\b|\s\+\s)\s*/i)
  .map(normalized).filter(Boolean).sort();
}
function sameArtist(request,candidate){
 const a=normalized(request),b=normalized(candidate);
 if(!a||!b)return false;
 if(a===b)return true;
 const left=creditedArtists(request),right=creditedArtists(candidate);
 return left.length>0&&left.length===right.length&&left.every((name,index)=>name===right[index]);
}
function durationAgrees(request,candidate){
 const a=Number(request),b=Number(candidate);
 return a>0&&b>0&&Math.abs(a-b)<=Math.min(12,Math.max(4,Math.round(a*.03)));
}
function allowedCover(value,hosts){
 try{
  const u=new URL(String(value||''));
  if(u.protocol!=='https:'||u.username||u.password||!hosts.some(host=>u.hostname===host||u.hostname.endsWith('.'+host)))return '';
  return u.href;
 }catch{return ''}
}
export function upscaleAppleCover(raw,pixels=2400){
 const src=allowedCover(raw,['mzstatic.com']);if(!src)return '';
 const u=new URL(src),size=Math.min(2400,Math.max(1200,Number(pixels)||2400));
 // Both modern /100x100bb.jpg and old /100x100-75.jpg Apple artwork.
 const next=u.pathname.replace(/\/\d{2,4}x\d{2,4}(?:bb)?(?=(?:-\d+)?\.(?:jpe?g|png|webp)$)/i,
  '/'+size+'x'+size+'bb');
 if(next===u.pathname)return ''; // Never claim a 100px original is a master.
 u.pathname=next;return u.href;
}
function ranking(input,item){
 if(!input?.title||!item?.title||!matchKey(input.title)||matchKey(input.title)!==matchKey(item.title))return -1;
 if(isGenericArtist(input.artist)||!sameArtist(input.artist,item.artist))return -1;
 const dur=durationAgrees(input.duration,item.duration);
 // A duration disagreement is never rescued by a shared album name: albums
 // often include edits, interludes and alternative recordings with same title.
 if(Number(input.duration)>0&&Number(item.duration)>0&&!dur)return -1;
 const album=Boolean(input.album&&item.album&&albumKey(input.album)===albumKey(item.album));
 // Require a recording check, or an exact named album where durations are
 // missing. A title-only hit could be a remix, karaoke, re-recording or cover.
 if(!dur&&!album)return -1;
 return 100+(dur?22:0)+(album?30:0)+(normalized(input.artist)===normalized(item.artist)?10:0);
}
function choose(input,items){
 const scores=items.map(item=>({item,score:ranking(input,item)})).filter(x=>x.score>=100&&x.item.artwork);
 scores.sort((a,b)=>b.score-a.score);
 // If top hits credit different albums with exactly equivalent scores, only
 // accept when duration corroborates the track. We never guess on titles alone.
 return scores[0]?.item||null;
}
export function matchAppleCover(input,results=[]){
 const entries=results.filter(x=>x?.wrapperType==='track'&&x.trackName&&x.artistName).map(x=>({
  title:x.trackName,artist:x.artistName,album:x.collectionName||'',
  duration:Number(x.trackTimeMillis||0)/1000,artwork:upscaleAppleCover(x.artworkUrl100||''),
  source:'apple',link:allowedCover(x.artworkUrl100||'',['mzstatic.com'])
 }));
 return choose(input,entries);
}
export function matchDeezerCover(input,results=[]){
 const entries=results.filter(x=>x&&x.title&&x.artist?.name&&x.album).map(x=>({
  title:x.title,artist:x.artist.name,album:x.album.title||'',
  duration:Number(x.duration)||0,
  artwork:allowedCover(x.album.cover_xl||x.album.cover_big||'',['dzcdn.net']),
  source:'deezer'
 }));
 return choose(input,entries);
}
function parseRequest(request){
 const p=new URL(request.url).searchParams;
 const title=sanitize(p.get('title'),160),artist=sanitize(p.get('artist'),110);
 const album=sanitize(p.get('album'),135),duration=Number(p.get('duration')||0);
 if(title.length<2||isGenericArtist(artist)||!Number.isFinite(duration)||duration<0||duration>1200||
   !(duration>0||album.length>=3))return null;
 return {title,artist,album,duration};
}
const json=(data,ttl)=>Response.json(data,{headers:{
 'cache-control':'public, max-age='+ttl+', s-maxage='+ttl,
 'x-content-type-options':'nosniff','content-type':'application/json; charset=utf-8'
}});
async function apple(input){
 const url=new URL('https://itunes.apple.com/search');
 // Search on lead artist for collaboration credits, then strictly verify all artists.
 const lead=String(input.artist).split(/\s*(?:,|&|;|\band\b|\bfeat\b|\bwith\b)\s*/i)[0]||input.artist;
 url.searchParams.set('term',[lead,input.title].join(' ').slice(0,150));
 url.searchParams.set('entity','song');url.searchParams.set('media','music');url.searchParams.set('limit','35');
 const lookup=async country=>{
  const localized=new URL(url);localized.searchParams.set('country',country);
  try{
   const response=await fetch(localized,{headers:{accept:'application/json'},
    signal:AbortSignal.timeout(3900)});
   if(!response.ok)return null;const body=await response.json();
   return matchAppleCover(input,Array.isArray(body.results)?body.results:[]);
  }catch{return null}
 };
 // The US storefront often lacks region-specific releases, including
 // Brazilian tracks. Query BR only if the primary matched catalog is empty.
 const primary=await lookup('US');
 return primary||await lookup('BR');
}
async function deezer(input){
 const url=new URL('https://api.deezer.com/search/track');
 const lead=String(input.artist).split(/\s*(?:,|&|;|\bfeat\b|\bwith\b)\s*/i)[0];
 url.searchParams.set('q','artist:"'+lead.replace(/"/g,'')+'" track:"'+input.title.replace(/"/g,'')+'"');
 url.searchParams.set('limit','25');
 try{
  const r=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(4600)});
  if(!r.ok)return null;const body=await r.json();
  return matchDeezerCover(input,Array.isArray(body.data)?body.data:[]);
 }catch{return null}
}
// Cover Art Archive uses original images via archive.org, which can be slow
// or unavailable even when its own CDN has an intact 1200px derivative.
// Probe both versions for the SAME MusicBrainz-confirmed recording and release.
// Never substitute an unrelated release's artwork by similar title alone.
let lastMusicBrainz=0,musicBrainzQueue=Promise.resolve();
function pacedMusicBrainz(task){
 const start=musicBrainzQueue.catch(()=>{}).then(async()=>{
  const delay=Math.max(0,1150-(Date.now()-lastMusicBrainz));
  if(delay)await new Promise(done=>setTimeout(done,delay));
  lastMusicBrainz=Date.now();
  return task();
 });
 musicBrainzQueue=start.catch(()=>{});
 return start;
}
export function verifiedArchiveCoverURLs(releaseId,releaseGroupId=''){
 const valid=value=>/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(value||''));
 const urls=[];
 for(const [type,id] of [['release',releaseId],['release-group',releaseGroupId]]){
  if(!valid(id))continue;
  const base='https://coverartarchive.org/'+type+'/'+id+'/front';
  urls.push(base,base+'-1200');
 }
 return urls;
}
async function inspectArchiveURLs(urls){
 const checks=await Promise.all(urls.map(async url=>{
  try{
   const response=await fetch(url,{method:'HEAD',redirect:'follow',
    signal:AbortSignal.timeout(url.endsWith('-1200')?3200:2600)});
   const type=String(response.headers.get('content-type')||'').toLowerCase();
   return response.ok&&type.startsWith('image/')?url:null;
  }catch{return null}
 }));
 return checks.filter(Boolean);
}
async function musicBrainzCover(input){
 const clean=value=>String(value||'').replace(/[\\"]/g,' ').replace(/[^\p{L}\p{N}\s-]/gu,' ').trim().slice(0,90);
 const title=clean(cleanTitle(input.title)),artist=clean(String(input.artist).split(/\s*(?:,|&|;|\bfeat\b|\bwith\b)\s*/i)[0]);
 if(!title||!artist)return null;
 const u=new URL('https://musicbrainz.org/ws/2/recording');
 u.searchParams.set('query','recording:"'+title+'" AND artist:"'+artist+'"');
 u.searchParams.set('fmt','json');u.searchParams.set('limit','8');
 try{
  const data=await pacedMusicBrainz(async()=>{
   const response=await fetch(u,{headers:{accept:'application/json',
    'user-agent':'GnarlyMetadata/1.0 (https://github.com/miscrapha-DELTA-IA/Gnarly-web)'},
    signal:AbortSignal.timeout(5400)});
   return response.ok?response.json():null;
  });
  const records=Array.isArray(data?.recordings)?data.recordings:[];
  // A known album must corroborate the release; otherwise use only
  // the release confirmed by BOTH the recording title/artist and duration.
  const constrained=records.map(recording=>({
   ...recording,
   releases:Array.isArray(recording.releases)?
    recording.releases.filter(release=>!input.album||albumKey(release.title)===albumKey(input.album)):[]
  })).filter(recording=>recording.releases.length);
  const match=matchMusicBrainz(input,constrained);
  const release=match?.identifiers?.releaseMBID;
  if(!match||!verifiedArchiveCoverURLs(release).length)return null;
  const matchedRecord=constrained.find(recording=>recording.id===match.identifiers.recordingMBID);
  const matchedRelease=matchedRecord?.releases?.find(item=>item.id===release);
  const groupId=matchedRelease?.['release-group']?.id||'';
  const primary=await inspectArchiveURLs(verifiedArchiveCoverURLs(release));
  let verified=primary;
  if(!verified.length&&groupId)
   verified=await inspectArchiveURLs(verifiedArchiveCoverURLs('',groupId));
  if(!verified.length)return null;
  return {artwork:verified[0],provider:'musicbrainz',album:match.album||'',
   alternatives:verified.slice(1).map(artwork=>({artwork,provider:'musicbrainz'}))};
 }catch{return null}
}
async function lookup(input,hd=false){
 // HD mode probes all available release-matched catalogs. A 100px result
 // must not win simply because its provider answered first.
 const [appleCover,deezerCover]=hd?
  await Promise.all([apple(input),deezer(input)]):
  [await apple(input),null];
 const normalDeezer=hd||appleCover?deezerCover:await deezer(input);
 const candidates=[
  ...(appleCover?[{artwork:appleCover.artwork,provider:appleCover.source,album:appleCover.album}]:[]),
  ...(normalDeezer?[{artwork:normalDeezer.artwork,provider:normalDeezer.source,album:normalDeezer.album}]:[])
 ];
 // With only one verified catalog, a release-matched archival original
 // may carry more real detail than a resized storefront image. Compare it as
 // a third candidate, but never use a title-only or unverified album match.
 if(!candidates.length||(hd&&candidates.length===1)){
  const brainz=await musicBrainzCover(input);
  if(brainz)candidates.push(
   {artwork:brainz.artwork,provider:brainz.provider,album:brainz.album},
   ...(brainz.alternatives||[])
  );
 }
 if(!candidates.length)return null;
 return {...candidates[0],...(hd?{candidates}:{} )};
}
export async function serveAlbumArtwork(request){
 const input=parseRequest(request),hd=new URL(request.url).searchParams.get('mode')==='hd';
 if(!input)return Response.json({artwork:null,reason:'insufficient_verified_credits'},{status:200,
  headers:{'cache-control':'no-store'}});
 const key=[matchKey(input.title),normalized(input.artist),albumKey(input.album),Math.round(input.duration),hd?'hd':'normal'].join('|');
 const recent=cache.get(key);
 if(recent&&recent.expires>Date.now())return json(recent.value,recent.value.artwork?86400:240);
 let promise=inflight.get(key);
 if(!promise){promise=lookup(input,hd);inflight.set(key,promise)}
 try{
  const result=await promise;
  const value=result||{artwork:null,reason:'no_confident_album_match'};
  cache.set(key,{value,expires:Date.now()+(result?POSITIVE_TTL:NEGATIVE_TTL)});
  if(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
  return json(value,result?86400:240);
 }finally{if(inflight.get(key)===promise)inflight.delete(key)}
}
