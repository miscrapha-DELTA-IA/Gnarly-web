/**
 * GNARLY · album artwork independent of YouTube video thumbnails.
 *
 * Only attach covers when song title, credited artist and recording duration
 * agree. This endpoint NEVER changes audio/source/video ID or music metadata.
 * Apple iTunes and Deezer are queried server-side (no extra browser CORS,
 * credentials, third-party image-proxy, or video-frame upscaling).
 */
import {cleanTitle,normalized,isGenericArtist} from './metadata-intelligence.js';

const cache=new Map(),inflight=new Map(),MAX_CACHE=220,POSITIVE_TTL=24*60*60*1000,NEGATIVE_TTL=20*60*1000;
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
 try{
  const r=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(4900)});
  if(!r.ok)return null;const body=await r.json();
  return matchAppleCover(input,Array.isArray(body.results)?body.results:[]);
 }catch{return null}
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
async function lookup(input){
 const appleCover=await apple(input);
 if(appleCover)return {artwork:appleCover.artwork,provider:appleCover.source,album:appleCover.album};
 const deezerCover=await deezer(input);
 return deezerCover?{artwork:deezerCover.artwork,provider:deezerCover.source,album:deezerCover.album}:null;
}
export async function serveAlbumArtwork(request){
 const input=parseRequest(request);
 if(!input)return Response.json({artwork:null,reason:'insufficient_verified_credits'},{status:200,
  headers:{'cache-control':'no-store'}});
 const key=[matchKey(input.title),normalized(input.artist),albumKey(input.album),Math.round(input.duration)].join('|');
 const recent=cache.get(key);
 if(recent&&recent.expires>Date.now())return json(recent.value,recent.value.artwork?86400:1200);
 let promise=inflight.get(key);
 if(!promise){promise=lookup(input);inflight.set(key,promise)}
 try{
  const result=await promise;
  const value=result||{artwork:null,reason:'no_confident_album_match'};
  cache.set(key,{value,expires:Date.now()+(result?POSITIVE_TTL:NEGATIVE_TTL)});
  if(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
  return json(value,result?86400:1200);
 }finally{if(inflight.get(key)===promise)inflight.delete(key)}
}
